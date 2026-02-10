class AnimationController {
    constructor(audioElement, maxFps=60) {
        this.audioElement = audioElement;
        this.maxFps = maxFps;
        this.minFrameTime = 1000 / maxFps;
        this.isPaused = false;
        this.progressBar = $("#progress-bar");
        this.progressContainer = $("#progress-container");
        this.durationDisplay = $("#duration");
        this.seekTimeDisplay = $("#seek-time");

        this.frameCount = 0;
        this.currentFps = 0;
        this.lastFpsUpdate = 0;
        this.lastFrameTime = 0;

        this.progressUpdating = false;
        this.progressBar.addEventListener("input", () => {
            if (this.audioElement.duration) {
                const seekTime = this.audioElement.duration * (this.progressBar.value / 100);
                this.seekTimeDisplay.textContent = this.formatTime(seekTime);
                this.audioElement.currentTime = seekTime;
                this.progressUpdating = true;
                this.updateProgress();
            }
        });
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    updateProgress() {
        if (this.audioElement.duration) {
            this.progressBar.value = (this.audioElement.currentTime / this.audioElement.duration) * 100;
            this.durationDisplay.textContent = this.formatTime(this.audioElement.duration);
        }
    }
    
    start(updateCallback) {
        this.updateCallback = updateCallback;
        this.animationId = requestAnimationFrame(this.animate.bind(this));

        this.frameCount = 0;
        this.currentFps = 0;
        this.lastFpsUpdate = performance.now();
        this.lastFrameTime = performance.now();
    }
    
    animate(currentTime) {
        const deltaTime = currentTime - this.lastFrameTime;
        
        if (deltaTime >= this.minFrameTime) {
            this.lastFrameTime = currentTime - (deltaTime % this.minFrameTime);
            
            this.updateCurrentFps(currentTime);
            this.updateCallback(this.currentFps);
            if (!this.isPaused) {
                this.updateProgress();
            }
        }
        
        this.animationId = requestAnimationFrame(this.animate.bind(this));
    }

    pause() {
        this.audioElement.pause();
        if (C.settings.autoPlay) {
            this.progressContainer.style.display = "block";
        }
        this.updateProgress();
    }
    
    resume() {
        this.audioElement.play();
        this.progressContainer.style.display = "none";
        if (C.settings.autoPlay) manager.reset();
        this.progressUpdating = false;
    }
    
    togglePause() {
        if (this.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
        this.isPaused = !this.isPaused;
    }
    
    updateCurrentFps(currentTime) {
        this.frameCount++;
        if (currentTime - this.lastFpsUpdate >= 1000) {
            this.currentFps = (this.frameCount * 1000) / (currentTime - this.lastFpsUpdate);
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
        }
    }
}