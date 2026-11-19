import os
import logging

logger = logging.getLogger(__name__)

_whisper_model = None
_current_model_size = None


def get_whisper_model(model_size="base", device="cpu", compute_type="int8"):
    """
    Lazy-loads and caches the WhisperModel instance.
    Runs efficiently on CPU using int8 quantization with float32 fallback.
    """
    global _whisper_model, _current_model_size

    if _whisper_model is not None and _current_model_size == model_size:
        return _whisper_model

    logger.info(f"Loading faster-whisper model '{model_size}' on {device} ({compute_type})...")

    from faster_whisper import WhisperModel

    try:
        _whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type)
    except Exception as e:
        logger.warning(f"Could not initialize with compute_type={compute_type}: {e}. Falling back to float32.")
        _whisper_model = WhisperModel(model_size, device=device, compute_type="float32")

    _current_model_size = model_size
    return _whisper_model


def transcribe_audio_file(file_path, model_size="base", language=None):
    """
    Transcribes an audio file using faster-whisper.
    Returns:
        dict: {
            "full_text": str,
            "language": str,
            "duration": float,
            "segments": list of { id, start, end, text }
        }
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    model = get_whisper_model(model_size=model_size)

    # Transcribe audio file
    segments_generator, info = model.transcribe(
        file_path,
        beam_size=5,
        language=language,
        vad_filter=True, # Voice activity detection filters out silence
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    segments_list = []
    text_chunks = []

    for seg in segments_generator:
        clean_text = seg.text.strip()
        if clean_text:
            segments_list.append({
                "id": seg.id,
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": clean_text,
            })
            text_chunks.append(clean_text)

    full_text = " ".join(text_chunks)

    return {
        "full_text": full_text,
        "language": info.language or "en",
        "duration": round(info.duration, 2) if info.duration else 0.0,
        "segments": segments_list,
    }

