# SIH26007: Mine Vehicle Safety — Complete Command Reference

## 1. Directory & Environment Mapping
Because this project runs in WSL Ubuntu while keeping files accessible in Windows Explorer, the paths are split intentionally for performance:

* **Windows Project Path (File Explorer / VS Code):**
  `C:\Users\asus\Downloads\SIH26007-Mine-Vehicle-Safety`
* **WSL Ubuntu Project Path:**
  `/mnt/c/Users/asus/Downloads/SIH26007-Mine-Vehicle-Safety`
* **WSL Python 3.12 Virtual Environment Path (Native Linux FS):**
  `/home/mohit/.venv312` (`~/.venv312`)

---

## 2. Daily Startup Commands (Run Every Time You Open WSL Terminal)
Whenever you open a new WSL terminal window, run these two commands first:

```bash
# 1. Activate the Python 3.12 virtual environment in Ubuntu Home
source ~/.venv312/bin/activate

# 2. Navigate to the project folder in Windows Downloads
cd /mnt/c/Users/asus/Downloads/SIH26007-Mine-Vehicle-Safety

# 1. Run Phase 1-3 & Phase 6 (Multi-Vehicle Risk + Pinhole Range/TTC Video & CSV)
python src/risk/risk_demo.py

# 2. Run Phase 4 (Multi-Level 0%, 40%, 65%, 80% Fog Quantitative Benchmark)
python src/detection/evaluate_fog.py

# 3. Run Phase 5 (Side-by-Side Raw Fog vs. CLAHE + Pseudo-IR Recovery Video & CSV)
python src/detection/visibility_recovery.py

# 4. Launch the 4-Tab Streamlit Dashboard
streamlit run src/dashboard/app.py

## 8. 30-Minute Video Stress Test (For TA Evaluation)

**How the math works:** 
If your base video is **10 seconds** long, looping it 180 times (`1 original + 179 loops`) equals **1800 seconds (30 minutes)**. 
*(Note: If your base video is actually 30 seconds long, change `-stream_loop 179` to `-stream_loop 59` to get 30 minutes).*

The `-c copy` flag tells `ffmpeg` to copy the video stream directly without re-encoding, so this 30-minute file generates in about 3 seconds with zero quality loss.

### Step 1: Create the 30-Minute Video (Run Before TA Arrives)
Run these commands in your WSL terminal to back up the short video and generate the 30-minute version of `mine_fog.mp4`:

```bash
# 1. Back up the original short fog video
cp data/input/mine_fog.mp4 data/input/mine_fog_short_backup.mp4

# 2. Generate the 30-minute looping video instantly
ffmpeg -y -stream_loop 179 -i data/input/mine_fog_short_backup.mp4 -c copy data/input/mine_fog.mp4

# 3. Verify the file size (should be significantly larger, e.g., 100MB+)
ls -lh data/input/mine_fog.mp4

# 1. Overwrite the 30-minute video with your short backup
mv data/input/mine_fog_short_backup.mp4 data/input/mine_fog.mp4

# 2. Re-run risk_demo.py quickly to update the dashboard back to the short version
python src/risk/risk_demo.py