# stt_service/app.py
from flask import Flask, request, jsonify
import tempfile, os, subprocess
from faster_whisper import WhisperModel
import soundfile as sf

app = Flask(__name__)

# Choose model size you have resources for: "tiny", "base", "small", "medium", "large-v2"
# Put downloaded model files in the faster-whisper cache or let it download automatically.
MODEL_SIZE = "small"  # change to "large-v2" if you have GPU/ram
DEVICE = "cpu"        # or "cuda" if you have an NVIDIA GPU

print("Loading Whisper model...", MODEL_SIZE)
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type="int8_float16" if DEVICE=="cpu" else "float16")

def webm_to_wav(in_path, out_path):
    # Use ffmpeg to convert any incoming audio (webm/ogg) to WAV 16k/16bit mono which Whisper expects
    # Make sure ffmpeg is installed on your system
    import ffmpeg
    stream = ffmpeg.input(in_path)
    stream = ffmpeg.output(stream, out_path, format='wav', acodec='pcm_s16le', ac=1, ar='16000')
    ffmpeg.run(stream, overwrite_output=True)


@app.route("/stt", methods=["POST"])
def stt():
    # Accept raw audio bytes (Content-Type: audio/*) or file upload via multipart
    # This endpoint will save the bytes to a temp file and run faster-whisper transcription.
    bytes_data = request.data
    if not bytes_data:
        return jsonify({"error": "no_audio"}), 400

    tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
    tmp_in.write(bytes_data)
    tmp_in.flush()
    tmp_in.close()

    tmp_wav = tmp_in.name + ".wav"
    try:
        webm_to_wav(tmp_in.name, tmp_wav)

        # Run faster-whisper transcription
        segments, info = model.transcribe(tmp_wav, beam_size=5)
        text = " ".join([seg.text for seg in segments]).strip()
        response = {"text": text, "language": info.language, "task": info.task}
        return jsonify(response)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_in.name)
            if os.path.exists(tmp_wav):
                os.unlink(tmp_wav)
        except:
            pass

if __name__ == "__main__":
    # Production: use gunicorn/uvicorn; Flask dev server is fine for testing.
    app.run(host="0.0.0.0", port=5200, debug=True)
