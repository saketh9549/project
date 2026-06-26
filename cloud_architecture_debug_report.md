# Cloud Architecture & Debugging Report: EC2 Instance Crashes During Video Indexing

This report analyzes the root causes of AWS EC2 instance crashes (configured with 4GB RAM and 2 CPUs) when processing/indexing videos longer than 2 minutes or in high quality, and provides actionable solutions to resolve the issue.

---

## Executive Summary

When a video is indexed, the backend performs three resource-intensive operations locally:
1. **Audio Extraction**: Spawns an `ffmpeg` subprocess to extract 16kHz mono audio.
2. **Transcription**: Instantiates a local neural network (`faster-whisper` "base" model) in memory to run speech-to-text inference on the CPU.
3. **Semantic Chunking**: Queries Gemini with the transcription timeline.

On a machine with **4GB RAM** and **2 CPUs** (such as an AWS `t3.medium` or `t2.medium` instance), the local compilation of the Whisper model and the subsequent inference process exhaust physical memory, triggering the Linux kernel's **Out-Of-Memory (OOM) Killer**, which immediately terminates the backend server process (`server.py`), causing the instance to crash or freeze.

---

## Part 1: Root Causes (Why the Instance Crashes)

### 1. Memory Exhaustion (OOM) by Local Whisper Inference
* **Model Loading Overhead**: The `faster-whisper` `"base"` model has ~145 million parameters. Although the weights on disk are ~145MB (under `int8` quantization), loading them into the PyTorch/CTranslate2 runtime environment consumes significant memory.
* **Inference RAM Footprint**: During transcription, audio features are converted into Mel spectrograms and processed in 30-second blocks. With `beam_size=5` (configured in `transcribe_audio`), the search tree tracks multiple candidate transcriptions. For longer audio files (> 2 minutes), memory usage grows rapidly. The Python process's RSS (Resident Set Size) easily spikes to **2.5GB - 3GB** or more.
* **Result**: Since the host OS and other services (MongoDB, FastAPI/Uvicorn, logging) already consume ~1GB of RAM, the total memory request exceeds 4GB. Without virtual memory, the kernel terminates the python backend process with a `SIGKILL` (Out Of Memory).

### 2. Absence of Swap Space
* **The Problem**: Standard AWS Ubuntu AMIs do not come with swap space configured by default. 
* **Result**: As soon as physical RAM utilization hits 100%, the OS has no overflow storage to temporarily page inactive memory. It has no choice but to forcefully kill the primary memory-consuming process (the backend server).

### 3. CPU Credit Exhaustion and Throttling (t-Series Instances)
* **The Problem**: Running machine learning inference (Whisper) on a CPU pins all available virtual CPUs to 100% utilization.
* **Result**: AWS `t2`/`t3` burstable instances rely on a "CPU Credit" balance. Once Whisper drains this balance, AWS throttles the CPU to baseline performance (typically 20% or less). Throttled execution causes processing to take 10x longer, triggering gateway timeouts and making the server completely unresponsive.

### 4. Concurrent File Buffering
* **The Problem**: Before indexing, the entire S3 video file is downloaded and buffered to local disk `/tmp` directory. For large high-quality videos, disk write-cache operations consume CPU cycles and kernel buffers, adding to the system stress.

---

## Part 2: Actionable Solutions

Here are four ways to resolve this issue, ranging from quick infrastructure tweaks to architectural best practices.

### Solution 1: Configure Virtual Memory (Swap Space) — *Recommended Quick Fix*
Adding swap space allows the operating system to offload idle RAM pages to the SSD. This prevents the OOM killer from terminating the server when memory spikes during transcription.

Run the following commands on your AWS EC2 instance:
```bash
# 1. Create a 4GB swap file (or 8GB if you have enough disk space)
sudo fallocate -l 4G /swapfile

# 2. Set the correct file permissions
sudo chmod 600 /swapfile

# 3. Format the file as swap space
sudo mkswap /swapfile

# 4. Enable the swap file
sudo swapon /swapfile

# 5. Make the swap file permanent across reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 6. Verify swap is active
sudo free -h
```
* **Pros**: 100% free, takes 2 minutes to apply, and guarantees the server will not crash due to memory exhaustion.
* **Cons**: Transcription might be slightly slower during heavy swapping, but the process will complete successfully.

---

### Solution 2: Switch to a Smaller Whisper Model
If you want to reduce memory usage directly in the application configuration, you can change the model from `"base"` to `"tiny"`.

* **Action**: In `backend/src/indexer.py` or where transcription is called, change the model name parameter to `"tiny"`.
* **Pros**: 
  - The `"tiny"` model is ~4x smaller than `"base"` (~39M parameters).
  - Uses less than **500MB** of RAM.
  - Speeds up transcription by 3x–4x on CPU.
* **Cons**: A minor reduction in transcription accuracy, particularly for complex terminology or accents.

---

### Solution 3: Limit CTranslate2 Threading
By default, `faster-whisper` and openMP spawn thread pools that try to utilize all available CPU cores, causing high contention and memory overhead.

* **Action**: Restrict the number of threads used by CTranslate2 by setting environment variables in your deployment shell or systemd service file:
  ```bash
  export OMP_NUM_THREADS=1
  export CT2_NUM_THREADS=1
  ```
* **Pros**: Reduces CPU contention and memory allocation spikes.
* **Cons**: Transcription takes slightly longer but executes much more stably.

---

### Solution 4: Offload Speech-to-Text to a Managed API — *Architectural Best Practice*
Running heavy machine learning model inference (Whisper) locally on a budget-tier web server (4GB RAM CPU) is an anti-pattern. In production, transcription should be offloaded.

* **Option A: Use OpenAI Whisper API / Deepgram API**
  - **Implementation**: Instead of calling `faster_whisper` locally, send the extracted audio file to the OpenAI Whisper endpoint or Deepgram.
  - **Pros**: Zero local RAM/CPU load; lightning-fast execution; near-perfect accuracy.
* **Option B: Use Gemini 1.5 Flash/Pro Direct Audio Ingestion**
  - **Implementation**: Since Gemini 1.5 Flash supports audio inputs natively, you do not need Whisper at all. You can upload the audio file to Gemini using the Google GenAI SDK and ask it to transcribe and identify boundaries in a single API call.
  - **Pros**: Consolidates transcription and boundary analysis into one API, eliminating Whisper dependency entirely.
