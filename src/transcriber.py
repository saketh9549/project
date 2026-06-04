import os
from typing import Dict, Any, List
from faster_whisper import WhisperModel

class WhisperInitializationError(Exception):
    """Exception raised when local Whisper model fails to initialize or transcribe."""
    pass

def transcribe_audio(
    audio_path: str, 
    model_name: str = "base", 
    language: str = None
) -> Dict[str, Any]:
    """Transcribes local audio using a local native faster-whisper WhisperModel on CPU.
    
    Args:
        audio_path: Absolute path to the local audio file.
        model_name: Name of the model to use (default: "base").
        language: ISO-639-1 language code (optional, e.g. "en").
        
    Returns:
        The transcription response containing segments with timestamps.
        
    Raises:
        FileNotFoundError: If the audio file does not exist.
        WhisperInitializationError: If model initialization or transcription fails.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
    print(f"[Transcriber] Initializing local Whisper model '{model_name}' on CPU (int8)...")
    
    try:
        # Initialize Whisper model optimized for CPU cycles and storage limit
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        
        print(f"[Transcriber] Transcribing {os.path.basename(audio_path)} using faster-whisper...")
        
        # Run transcription with beam size 5
        segments, info = model.transcribe(audio_path, beam_size=5, language=language)
        
        # Evaluate generator and map response to dictionary schema expected by indexer
        mapped_segments = []
        for s in segments:
            mapped_segments.append({
                "start": float(s.start),
                "end": float(s.end),
                "text": s.text.strip()
            })
            
        print(f"[Transcriber] Transcription finished successfully. Detected language: {info.language}")
        return {"segments": mapped_segments}
        
    except Exception as e:
        raise WhisperInitializationError(
            f"Local Whisper transcription failed: {e}\n"
            "Please ensure faster-whisper is installed properly and model files can be downloaded."
        ) from e

def extract_segments(transcription_result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Helper to extract clean segment dictionaries with start, end, and text fields."""
    segments = transcription_result.get("segments", [])
    if not segments and transcription_result.get("text"):
        # Fallback if Whisper doesn't return segments but returns overall text
        return [{
            "start": 0.0,
            "end": 0.0, # Unknown duration
            "text": transcription_result.get("text")
        }]
        
    extracted = []
    for seg in segments:
        extracted.append({
            "start": float(seg.get("start", 0.0)),
            "end": float(seg.get("end", 0.0)),
            "text": seg.get("text", "").strip()
        })
    return extracted
