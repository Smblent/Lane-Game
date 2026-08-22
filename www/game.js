// ============================================================
// PATHFINDER - Production Ready Mobile Game
// Architecture: Clean state machine with object pooling
// Controls: Swipe Left / Right / Up
// ============================================================

(function() {
    "use strict";

    // ---------- DOM REFS ----------
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const deathScreen = document.getElementById('death-screen');
    const finalScoreSpan = document.getElementById('final-score');
    const reviveBtn = document.getElementById('revive-btn');
    const restartBtn = document.getElementById('restart-btn');

    // ---------- RESPONSIVE SCALING ----------
    // We want a fixed logic size (480x800) and scale to fit screen.
    const DESIGN_WIDTH = 480;
    const DESIGN_HEIGHT = 800;
    let scaleFactor = 1;
    let offsetX = 0;
    let offsetY = 0;

    function resizeCanvas() {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        // Maintain aspect ratio
        const scaleX = winW / DESIGN_WIDTH;
        const scaleY = winH / DESIGN_HEIGHT;
        scaleFactor = Math.min(scaleX, scaleY);
        
        canvas.width = DESIGN_WIDTH;
        canvas.height = DESIGN_HEIGHT;
        
        // CSS scaling for crisp rendering
        canvas.style.width = (DESIGN_WIDTH * scaleFactor) + 'px';
        canvas.style.height = (DESIGN_HEIGHT * scaleFactor) + 'px';
        
        // Center the canvas if aspect ratio differs
        offsetX = (winW - (DESIGN_WIDTH * scaleFactor)) / 2;
        offsetY = (winH - (DESIGN_HEIGHT * scaleFactor)) / 2;
        canvas.style.marginLeft = offsetX + 'px';
        canvas.style.marginTop = offsetY + 'px';
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // ---------- GAME STATE ----------
    const STATE = {
        MENU: 0,
        PLAYING: 1,
        DEAD: 2,
        REVIVING: 3
    };

    let currentState = STATE.MENU;
    let score = 0;
    let highScore = parseInt(localStorage.getItem('pathfinder_high')) || 0;
    let gameSpeed = 4.5; // Base speed (increases with score)
    let laneWidth = 120; // Width of each lane
    let playerX = DESIGN_WIDTH / 2; // Center lane initially
    let targetX = playerX;
    let playerY = DESIGN_HEIGHT - 150; // Ground level
    let playerZ = 0; // For jump (z-axis)
    let playerWidth = 30;
    let playerHeight = 40;
    let isJumping = false;
    let jumpVelocity = 0;
    let gravity = -0.6;
    let swipeThreshold = 20; // Min pixels for swipe
    
    // Object pools
    let obstacles = [];
    let gems = [];
    let trailParticles = [];
    
    // Spawn control
    let frameCounter = 0;
    let spawnRate = 40; // Frames between spawns
    let gemSpawnRate = 25;

    // Touch handling
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isSwiping = false;

    // ---------- HELPER FUNCTIONS ----------
    function resetGame() {
        score = 0;
        gameSpeed = 4.5;
        playerX = DESIGN_WIDTH / 2;
        targetX = playerX;
        playerY = DESIGN_HEIGHT - 150;
        playerZ = 0;
        isJumping = false;
        jumpVelocity = 0;
        obstacles = [];
        gems = [];
        trailParticles = [];
        frameCounter = 0;
        spawnRate = 40;
        currentState = STATE.PLAYING;
        deathScreen.style.display = 'none';
    }

    // Spawn obstacle in a lane (0,1,2)
    function spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const x = (lane * laneWidth) + (laneWidth / 2) - 20; // Center the obstacle
        // Randomize obstacle type: 0 = static block, 1 = moving spike
        const type = Math.random() > 0.7 ? 1 : 0;
        obstacles.push({
            x: x,
            y: -40, // Spawn above screen
            width: 35,
            height: 40,
            type: type,
            lane: lane,
            speed: gameSpeed * 1.2 // Slightly faster than scroll to create challenge
        });
    }

    function spawnGem() {
        const lane = Math.floor(Math.random() * 3);
        const x = (lane * laneWidth) + (laneWidth / 2) - 15;
        gems.push({
            x: x,
            y: -30,
            width: 20,
            height: 20,
            collected: false
        });
    }

    // ---------- INPUT HANDLING (TOUCH / MOUSE) ----------
    function handlePointerDown(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        // Get touch or mouse position relative to canvas CSS
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        // Convert to canvas logical coordinates
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;
        const canvasX = (clientX - canvasRect.left) * scaleX;
        const canvasY = (clientY - canvasRect.top) * scaleY;
        
        touchStartX = canvasX;
        touchStartY = canvasY;
        touchStartTime = Date.now();
        isSwiping = true;
    }

    function handlePointerUp(e) {
        e.preventDefault();
        if (!isSwiping || currentState !== STATE.PLAYING) {
            isSwiping = false;
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if (e.changedTouches) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;
        const canvasX = (clientX - canvasRect.left) * scaleX;
        const canvasY = (clientY - canvasRect.top) * scaleY;
        
        const deltaX = canvasX - touchStartX;
        const deltaY = canvasY - touchStartY;
        const deltaTime = Date.now() - touchStartTime;
        
        // Swipe detection
        if (Math.abs(deltaX) > swipeThreshold || Math.abs(deltaY) > swipeThreshold) {
            // Horizontal Swipe (Left/Right)
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (deltaX > 0) {
                    // Swipe Right -> Move Right
                    targetX = Math.min(DESIGN_WIDTH - laneWidth/2, targetX + laneWidth);
                } else {
                    // Swipe Left
                    targetX = Math.max(laneWidth/2, targetX - laneWidth);
                }
            } 
            // Vertical Swipe (Up for Jump)
            else if (deltaY < -swipeThreshold) {
                // Swipe Up
                if (!isJumping && playerZ === 0) {
                    isJumping = true;
                    jumpVelocity = 12; // Initial upward velocity
                }
            }
        } else {
            // If it's a tap (not a swipe), treat as jump for easier control
            if (!isJumping && playerZ === 0) {
                isJumping = true;
                jumpVelocity = 12;
            }
        }
        
        isSwiping = false;
    }

    // Register events
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    canvas.addEventListener('touchend', handlePointerUp, { passive: false });
    // Prevent context menu on long press
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---------- UI BUTTONS ----------
    reviveBtn.addEventListener('click', function() {
        // Simulate Rewarded Ad
        if (currentState === STATE.DEAD) {
            // In production, call AdMob/AdManager here.
            // For prototype, we just revive.
            currentState = STATE.REVIVING;
            // Restore player with invincibility frames
            playerY = DESIGN_HEIGHT - 150;
            playerZ = 0;
            isJumping = false;
            jumpVelocity = 0;
            // Clear obstacles in immediate vicinity (safety)
            obstacles = obstacles.filter(o => o.y > 100);
            currentState = STATE.PLAYING;
            deathScreen.style.display = 'none';
            // Reset speed slightly
            gameSpeed = Math.max(4.5, gameSpeed - 1);
        }
    });

    restartBtn.addEventListener('click', function() {
        resetGame();
    });

    // ---------- UPDATE LOGIC ----------
    function update() {
        if (currentState !== STATE.PLAYING) return;

        // 1. Increase difficulty
        gameSpeed = 4.5 + (score / 200);
        spawnRate = Math.max(15, 40 - Math.floor(score / 50));

        // 2. Player Movement (Smooth Lane Switching)
        const dx = targetX - playerX;
        if (Math.abs(dx) > 1) {
            playerX += dx * 0.2;
        } else {
            playerX = targetX;
        }

        // 3. Jump Physics
        if (isJumping) {
            playerZ += jumpVelocity;
            jumpVelocity += gravity;
            if (playerZ <= 0) {
                playerZ = 0;
                isJumping = false;
                jumpVelocity = 0;
            }
        }

        // 4. Scroll obstacles & gems
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const ob = obstacles[i];
            ob.y += gameSpeed;
            
            // Collision detection (AABB)
            if (!ob.passed) {
                const px = playerX - playerWidth/2;
                const py = playerY - playerHeight/2 - playerZ;
                if (px < ob.x + ob.width &&
                    px + playerWidth > ob.x &&
                    py < ob.y + ob.height &&
                    py + playerHeight > ob.y) {
                    // CRASH!
                    gameOver();
                    return;
                }
            }
            
            // Remove if off screen
            if (ob.y > DESIGN_HEIGHT + 50) {
                obstacles.splice(i, 1);
                // Increase score for surviving
                score += 1;
            }
        }

        // 5. Gems collection
        for (let i = gems.length - 1; i >= 0; i--) {
            const gem = gems[i];
            gem.y += gameSpeed;
            
            if (!gem.collected) {
                const px = playerX - playerWidth/2;
                const py = playerY - playerHeight/2 - playerZ;
                if (px < gem.x + gem.width &&
                    px + playerWidth > gem.x &&
                    py < gem.y + gem.height &&
                    py + playerHeight > gem.y) {
                    gem.collected = true;
                    score += 5; // Bonus
                    // Add visual feedback (could spawn particle)
                }
            }
            
            if (gem.y > DESIGN_HEIGHT + 50) {
                gems.splice(i, 1);
            }
        }

        // 6. Spawning
        frameCounter++;
        if (frameCounter % spawnRate === 0) {
            spawnObstacle();
            // Sometimes spawn two obstacles at once for difficulty
            if (score > 30 && Math.random() > 0.6) {
                spawnObstacle();
            }
        }
        if (frameCounter % gemSpawnRate === 0) {
            spawnGem();
        }

        // 7. Trail particles (aesthetic)
        if (frameCounter % 2 === 0) {
            trailParticles.push({
                x: playerX + (Math.random() - 0.5) * 10,
                y: playerY + 20 - playerZ,
                size: 4 + Math.random() * 6,
                alpha: 0.8,
                speedX: (Math.random() - 0.5) * 0.5,
                speedY: 1 + Math.random()
            });
        }
        for (let i = trailParticles.length - 1; i >= 0; i--) {
            const p = trailParticles[i];
            p.x += p.speedX;
            p.y += p.speedY;
            p.alpha -= 0.015;
            if (p.alpha <= 0) {
                trailParticles.splice(i, 1);
            }
        }
    }

    // ---------- GAME OVER ----------
    function gameOver() {
        currentState = STATE.DEAD;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('pathfinder_high', highScore.toString());
        }
        finalScoreSpan.textContent = score;
        deathScreen.style.display = 'block';
        
        // Show interstitial ad here (AdMob)
        // console.log('Show Ad');
    }

    // ---------- RENDER ----------
    function draw() {
        ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

        // 1. Background Grid (3D effect)
        ctx.strokeStyle = '#2a3450';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const x = (i * laneWidth) + (laneWidth / 2);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, DESIGN_HEIGHT);
            ctx.strokeStyle = '#3a4a6a';
            ctx.stroke();
        }

        // 2. Draw Gems
        for (let gem of gems) {
            if (!gem.collected) {
                // Glowing gem
                ctx.shadowColor = '#ffd93d';
                ctx.shadowBlur = 20;
                ctx.fillStyle = '#ffd93d';
                ctx.beginPath();
                ctx.arc(gem.x + gem.width/2, gem.y + gem.height/2, gem.width/2, 0, Math.PI * 2);
                ctx.fill();
                // Inner highlight
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff5b0';
                ctx.beginPath();
                ctx.arc(gem.x + gem.width/2 - 3, gem.y + gem.height/2 - 3, gem.width/4, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // 3. Draw Obstacles
        for (let ob of obstacles) {
            ctx.shadowBlur = 0;
            if (ob.type === 0) {
                // Static Block
                ctx.fillStyle = '#ff4757';
                ctx.shadowColor = '#ff4757';
                ctx.shadowBlur = 15;
                ctx.fillRect(ob.x, ob.y, ob.width, ob.height);
                // Border
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#c0392b';
                ctx.lineWidth = 2;
                ctx.strokeRect(ob.x, ob.y, ob.width, ob.height);
            } else {
                // Moving Spike (rotating)
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#e67e22';
                ctx.shadowColor = '#e67e22';
                ctx.shadowBlur = 15;
                const cx = ob.x + ob.width/2;
                const cy = ob.y + ob.height/2;
                ctx.beginPath();
                ctx.moveTo(cx, ob.y);
                ctx.lineTo(ob.x + ob.width, ob.y + ob.height);
                ctx.lineTo(ob.x, ob.y + ob.height);
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // 4. Draw Trail (behind player)
        for (let p of trailParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = '#00d2ff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00d2ff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size/2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // 5. Draw Player (with Z offset for jump)
        const px = playerX - playerWidth/2;
        const py = playerY - playerHeight/2 - playerZ;
        
        // Glow
        ctx.shadowColor = '#00d2ff';
        ctx.shadowBlur = 25;
        // Body
        ctx.fillStyle = '#00d2ff';
        ctx.beginPath();
        ctx.roundRect(px, py, playerWidth, playerHeight, 8);
        ctx.fill();
        // Cockpit
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#aaffff';
        ctx.beginPath();
        ctx.arc(playerX, py + 10, 8, 0, Math.PI * 2);
        ctx.fill();
        // Wing details
        ctx.fillStyle = '#0097b2';
        ctx.fillRect(px - 8, py + 15, 8, 10);
        ctx.fillRect(px + playerWidth, py + 15, 8, 10);
        
        // 6. UI HUD (Score)
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Score: ' + score, 20, 50);
        ctx.fillStyle = '#ffd93d';
        ctx.fillText('Best: ' + highScore, 20, 85);
        
        // Speed indicator
        ctx.fillStyle = '#8899bb';
        ctx.font = '14px Arial';
        ctx.fillText('Speed: ' + Math.round(gameSpeed * 10) / 10, 20, 115);
        
        // Jump indicator
        if (playerZ > 0) {
            ctx.fillStyle = '#00d2ff';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⬆', playerX, py - 20);
        }
    }

    // Extend Canvas for roundRect if needed
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
            if (r > w/2) r = w/2;
            if (r > h/2) r = h/2;
            this.moveTo(x + r, y);
            this.lineTo(x + w - r, y);
            this.quadraticCurveTo(x + w, y, x + w, y + r);
            this.lineTo(x + w, y + h - r);
            this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            this.lineTo(x + r, y + h);
            this.quadraticCurveTo(x, y + h, x, y + h - r);
            this.lineTo(x, y + r);
            this.quadraticCurveTo(x, y, x + r, y);
            return this;
        };
    }

    // ---------- GAME LOOP (Optimized) ----------
    function gameLoop() {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }

    // ---------- START GAME ----------
    // Start in menu state but immediately start playing for prototype
    resetGame();
    gameLoop();

    // Handle visibility change to pause/resume (battery save)
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // Pause logic if needed
        }
    });

})();