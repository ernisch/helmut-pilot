"""Einmalige OFFLINE Messung. Kein Generator, Quellenbeweis oder Produktaufrufer.

Start ausschliesslich durch scripts/lokal.js. Modelle vorher separat laden.
Kein automatischer Download, kein API Aufruf, keine Productiondaten.
Die 54 vorab begruendeten synthetischen Faelle und die Schwelle bleiben fest.
Auch ein Bestehen waere nur endliche Messung, keine allgemeine Fachfreigabe.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import time


def sha(path):
    with open(path, "rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def gesperrt(*args, **kwargs):
    raise RuntimeError("NLI_OFFLINE_NETZ_GESPERRT")


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--modellpfad", required=True)
parser.add_argument("--ausgabe", required=True)
args = parser.parse_args()
if os.environ.get("HELMUT_SOURCE_MODE") != "off":
    raise RuntimeError("NLI_NUR_UEBER_LOKAL_JS")
socket.socket = gesperrt
socket.create_connection = gesperrt
socket.getaddrinfo = gesperrt

VERSIONS = {"onnxruntime": "1.23.2", "tokenizers": "0.22.2", "numpy": "2.2.6"}
for package, version in VERSIONS.items():
    if importlib.metadata.version(package) != version:
        raise RuntimeError("NLI_PAKETVERSION:" + package)

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

root = Path(__file__).resolve().parent
corpus_path = root / "fixtures/geltungslogik-nli-korpus.json"
CORPUS_HASH = "9cf48aacb7c61fb5a1506adf9989c8cff32b6a80a1643df71af74fe7e9615f71"
if sha(corpus_path) != CORPUS_HASH:
    raise RuntimeError("NLI_KORPUS_ABWEICHEND")
corpus = json.loads(corpus_path.read_text())
model_path = Path(args.modellpfad).resolve()
files = {
    "model_quantized.onnx": "27c39e884c14b03cf46cfc5485971b6db70ff330220d93dfe729c63fde43af0e",
    "tokenizer.json": "3aca3ce69a0a35aeb144a52c4f1d41c4246b8785f8f398315cc8fb6b24057810",
    "config.json": "4e4430c95100d613df80fa01276f231931e1b535557cf62fbb3cc50323e50cca",
}
for name, expected in files.items():
    if sha(model_path / name) != expected:
        raise RuntimeError("NLI_MODELL_ABWEICHEND:" + name)
config = json.loads((model_path / "config.json").read_text())
LABELS = ["entailment", "neutral", "contradiction"]
if config["id2label"] != {str(i): v for i, v in enumerate(LABELS)}:
    raise RuntimeError("NLI_LABELREIHENFOLGE")
if len(corpus["faelle"]) != 54 or corpus["schwelle"] != 0.9:
    raise RuntimeError("NLI_UMFANG")
ausgabe = Path(args.ausgabe)
if ausgabe.exists():
    raise RuntimeError("NLI_AUSGABE_EXISTIERT_KEIN_UEBERSCHREIBEN")

tokenizer = Tokenizer.from_file(str(model_path / "tokenizer.json"))
tokenizer.no_truncation()
tokenizer.no_padding()
options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(model_path / "model_quantized.onnx"),
                               sess_options=options, providers=["CPUExecutionProvider"])
input_names = {x.name for x in session.get_inputs()}
if not input_names <= {"input_ids", "attention_mask", "token_type_ids"} or "input_ids" not in input_names:
    raise RuntimeError("NLI_MODELLINPUT")

result = {
    "version": 1, "status": "laeuft", "modell": corpus["modell"],
    "revision": corpus["revision"], "format": corpus["format"],
    "dateihashes": files, "korpusHash": CORPUS_HASH, "laeuferHash": sha(__file__),
    "pakete": VERSIONS, "schwelle": corpus["schwelle"], "soll": 54,
    "positivSoll": 18, "negativSoll": 36, "modellInputs": sorted(input_names),
    "kiApiAufrufe": 0, "kiApiKostenUsd": 0, "externeInferenz": False,
    "produktpfadeGeprueft": 0, "vollstaendigeFaktenpruefung": False,
    "faelle": [],
}
start = time.monotonic()
try:
    for case in corpus["faelle"]:
        if time.monotonic() - start > 600:
            raise RuntimeError("NLI_ZEITGRENZE")
        # Modell erhaelt NUR den ganzen Originaltext und diese Behauptung.
        # Sollurteil, Begruendung, Fallkennung und andere Faelle sind kein Input.
        encoded = tokenizer.encode(case["quelle"], case["behauptung"], add_special_tokens=True)
        if len(encoded.ids) > config["max_position_embeddings"]:
            raise RuntimeError("NLI_KEIN_STILLES_ABSCHNEIDEN:" + case["id"])
        inputs = {"input_ids": encoded.ids, "attention_mask": encoded.attention_mask,
                  "token_type_ids": encoded.type_ids}
        t = time.monotonic()
        logits = session.run(None, {k: np.array([inputs[k]], dtype=np.int64) for k in input_names})[0][0]
        if len(logits) != 3 or not np.isfinite(logits).all():
            raise RuntimeError("NLI_LOGITS")
        exp = np.exp(logits.astype(np.float64) - np.max(logits))
        probs = exp / exp.sum()
        supported = bool(probs[0] >= corpus["schwelle"])
        result["faelle"].append({
            **case, "tokens": len(encoded.ids), "logits": logits.tolist(),
            "wahrscheinlichkeiten": dict(zip(LABELS, probs.tolist())),
            "label": LABELS[int(np.argmax(probs))], "modellGetragen": supported,
            "messkriteriumBestanden": supported == case["sollGetragen"],
            "dauerMs": round((time.monotonic() - t) * 1000, 3),
        })
    result["status"] = "abgeschlossen"
except Exception as exc:
    result["status"] = "abgebrochen"
    result["fehler"] = str(exc)
finally:
    result["dauerMs"] = round((time.monotonic() - start) * 1000, 3)
    rows = result["faelle"]
    result["geprueft"] = len(rows)
    result["ungeprueft"] = result["soll"] - len(rows)
    result["falschGetragen"] = sum(r["modellGetragen"] and not r["sollGetragen"] for r in rows)
    result["positiveErhalten"] = sum(r["modellGetragen"] and r["sollGetragen"] for r in rows)
    result["positiveVerloren"] = sum(not r["modellGetragen"] and r["sollGetragen"] for r in rows)
    result["endlicheMessungBestanden"] = (result["status"] == "abgeschlossen"
        and len(rows) == 54 and result["falschGetragen"] == 0 and result["positiveErhalten"] == 18)
    # Selbst ein positiver endlicher Befund setzt keine Fachfreigabe.
    with ausgabe.open("x") as file:
        file.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "faelle"}, ensure_ascii=False))
