"""
Live streaming transcription service using faster-whisper with speaker diarization.
"""

import os
import logging
import tempfile
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)

_whisper_model = None
_current_model_size = None
_diarization_pipeline = None


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


def get_diarization_pipeline():
    """Lazy-load the pyannote speaker diarization pipeline."""
    global _diarization_pipeline
    if _diarization_pipeline is not None:
        return _diarization_pipeline

    try:
        logger.info("Loading pyannote speaker diarization pipeline...")
        from pyannote.audio import Pipeline
        # Use the pre-trained speaker diarization pipeline
        # Note: Requires HuggingFace token for pyannote/segmentation and pyannote/speaker-diarization
        _diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=os.environ.get("HUGGINGFACE_TOKEN")
        )
        logger.info("Speaker diarization pipeline loaded successfully")
    except Exception as e:
        logger.warning(f"Could not load speaker diarization pipeline: {e}. Running without speaker identification.")
        _diarization_pipeline = None
    return _diarization_pipeline


def identify_speakers(audio_path: str) -> List[Dict]:
    """
    Run speaker diarization on audio file.
    Returns list of segments with speaker labels and timestamps.
    """
    pipeline = get_diarization_pipeline()
    if pipeline is None:
        return []

    try:
        diarization = pipeline(audio_path)
        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "speaker": speaker,
                "start": round(turn.start, 2),
                "end": round(turn.end, 2),
            })
        return segments
    except Exception as e:
        logger.error(f"Speaker diarization failed: {e}", exc_info=True)
        return []


def assign_speakers_to_transcript(transcript_segments: List[Dict], diarization_segments: List[Dict]) -> List[Dict]:
    """
    Assign speaker labels to transcript segments based on time overlap.
    """
    if not diarization_segments:
        # No diarization - assign default speaker
        for seg in transcript_segments:
            seg["speaker"] = "Speaker 1"
            seg["speaker_id"] = "SPEAKER_00"
        return transcript_segments

    # Create a mapping of time -> speaker
    for tseg in transcript_segments:
        t_start = tseg.get("start", 0)
        t_end = tseg.get("end", 0)
        t_mid = (t_start + t_end) / 2

        # Find the diarization segment that contains the midpoint
        assigned_speaker = "Speaker"
        assigned_speaker_id = "SPEAKER_00"
        max_overlap = 0

        for dseg in diarization_segments:
            d_start = dseg["start"]
            d_end = dseg["end"]
            # Calculate overlap
            overlap_start = max(t_start, d_start)
            overlap_end = min(t_end, d_end)
            overlap = max(0, overlap_end - overlap_start)

            if overlap > max_overlap:
                max_overlap = overlap
                assigned_speaker = dseg["speaker"]
                assigned_speaker_id = dseg["speaker"]

        # Normalize speaker label
        if assigned_speaker.startswith("SPEAKER_"):
            speaker_num = assigned_speaker.split("_")[-1]
            assigned_speaker = f"Speaker {int(speaker_num) + 1}"
        elif assigned_speaker.startswith("speaker_"):
            speaker_num = assigned_speaker.split("_")[-1]
            assigned_speaker = f"Speaker {int(speaker_num) + 1}"

        tseg["speaker"] = assigned_speaker
        tseg["speaker_id"] = assigned_speaker_id

    return transcript_segments


def transcribe_audio_chunk(audio_bytes, model_size="base", language=None):
    if not audio_bytes or len(audio_bytes) < 100:
        return {"text": "", "language": "en", "start": 0.0, "end": 0.0, "is_final": False, "segments": []}

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

        # Run speaker diarization
        diarization_segments = identify_speakers(tmp_path)
        segments_list = assign_speakers_to_transcript(segments_list, diarization_segments)

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
        return {"text": "", "language": "en", "start": 0.0, "end": 0.0, "is_final": False, "error": str(e), "segments": []}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
