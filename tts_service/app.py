# tts_service/app.py
from flask import Flask, request, jsonify
import tempfile, os, base64, json, uuid, shutil
from TTS.api import TTS
import soundfile as sf
from aeneas.executetask import ExecuteTask
from aeneas.task import Task

app = Flask(__name__)

# Select a TTS model that supports multi-speaker/voice cloning or speaker_wav argument.
# Example model: "tts_models/multilingual/multi-dataset/your_model_name" - pick one from Coqui model zoo.
TTS_MODEL_NAME = "tts_models/en/vctk/vits"  # example; replace with appropriate model for voice cloning
print("Loading TTS model...", TTS_MODEL_NAME)
tts = TTS(TTS_MODEL_NAME, progress_bar=False, gpu=False)  # set gpu=True if you have CUDA

def save_wav_and_b64(wav_path):
    with open(wav_path, "rb") as f:
        raw = f.read()
    return base64.b64encode(raw).decode("utf-8")

def run_aeneas_alignment(wav_path, text, lang="eng"):
    # Create temporary plain text file for aeneas input
    tmp_dir = tempfile.mkdtemp()
    text_file = os.path.join(tmp_dir, "text.txt")
    with open(text_file, "w", encoding="utf-8") as f:
        f.write(text)

    # Configure aeneas task to generate a plain-text sync map with phonemes/words
    # Use task config for phoneme-level alignment if available; aeneas primarily aligns at the word-level.
    config_string = u"task_language={}|is_text_type=plain|os_task_file_format=json".format(lang)
    task = Task(config_string=config_string)
    task.audio_file_path_absolute = wav_path
    task.text_file_path_absolute = text_file
    task.sync_map_file_path_absolute = os.path.join(tmp_dir, "out.json")

    ExecuteTask(task).execute()
    task.output_sync_map_file()

    with open(task.sync_map_file_path_absolute, "r", encoding="utf-8") as fh:
        out = json.load(fh)
    # out will contain word-level segments with start/end times. We'll convert to a simple viseme-style list at word granularity.
    visemes = []
    for fragment in out["fragments"]:
        start = float(fragment["begin"])
        end = float(fragment["end"])
        word = fragment["lines"][0] if fragment["lines"] else ""
        # map words to placeholder 'phoneme' (not precise). If you want phoneme-level, use MFA/phoneme lexicon.
        visemes.append({"phoneme": word, "start": start, "end": end})
    shutil.rmtree(tmp_dir)
    return visemes

@app.route("/synthesize", methods=["POST"])
def synthesize():
    """
    POST JSON: { text: str, voice_sample_path: optional str (server-side path), speed: optional float }
    Returns: { audioBase64: str, visemes: [{phoneme, start, end}], sampleRate: int }
    """
    data = request.json
    text = data.get("text", "")
    voice_sample_path = data.get("voice_sample_path", None)
    speed = float(data.get("speed", 1.0))

    # create tmp output path
    tmpout = os.path.join(tempfile.gettempdir(), f"tts_out_{uuid.uuid4().hex}.wav")

    try:
        # If model supports speaker_wav or speaker embedding input, pass your voice sample
        tts_args = {"text": text}
        if voice_sample_path:
            # Some TTS models accept keyword `speaker_wav` or `speaker_embeddings`. This depends on the model.
            # Try a common option: speaker_wav
            tts_args["speaker_wav"] = voice_sample_path
        # Optionally adjust speed (not all models support)
        # tts_args["speed"] = speed

        # Synthesize to file
        tts.tts_to_file(**tts_args, file_path=tmpout)

        # Run forced-alignment to get timings.
        # aeneas gives word-level alignments; for phoneme-level you'd use Montreal Forced Aligner (MFA)
        try:
            visemes = run_aeneas_alignment(tmpout, text, lang="eng")
        except Exception as align_err:
            # If alignment fails, return empty visemes but still audio
            print("Alignment failed:", align_err)
            visemes = []

        b64 = save_wav_and_b64(tmpout)
        sr = sf.info(tmpout).samplerate

        return jsonify({"audioBase64": b64, "visemes": visemes, "sampleRate": sr})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            if os.path.exists(tmpout):
                os.unlink(tmpout)
        except:
            pass

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5300, debug=True)
