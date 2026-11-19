"""
Live streaming transcription service using faster-whisper.
"""

import os
import logging
import tempfile

logger = logging.getLogger(__name__)

_whisper_model = None
_current_model_size = None


def get_whisper_model(model_size="base", device="cpu", compute_type="int8"):
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


def transcribe_audio_chunk(audio_bytes, model_size="base", language=None):
    if not audio_bytes or len(audio_bytes) < 100:
        return {"text": "", "language": "en", "start": 0.0, "end": 0.0, "is_final": False}

    tmp_path = None
    try:
        suffix = ".webm"
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(audio_bytes)

        model = get_whisper_model(model_size=model_size)
        segments_generator, info = model.transcribe(
            tmp_path,
            beam_size=3,
            language=language,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300),
        )

        text_chunks = []
        segments_list = []
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
            "text": full_text,
            "language": info.language or "en",
            "start": round(segments_list[0]["start"], 2) if segments_list else 0.0,
            "end": round(segments_list[-1]["end"], 2) if segments_list else 0.0,
            "is_final": True,
            "segments": segments_list,
        }

    except Exception as e:
        logger.error(f"Live transcription chunk failed: {e}", exc_info=True)
        return {"text": "", "language": "en", "start": 0.0, "end": 0.0, "is_final": False, "error": str(e)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
