// Dust Reveal Effect
let revealProgress = 0;
let revealThreshold = 15; // Number of sprinkles needed to reveal
let isRevealing = false;
let dustCanvasInstance = null; // Store the canvas instance

// Create custom cursor
const dustCursor = document.createElement('div');
dustCursor.className = 'dust-cursor';
document.body.appendChild(dustCursor);

// Track mouse movement for custom cursor
document.addEventListener('mousemove', (e) => {
    dustCursor.style.left = (e.clientX - 25) + 'px'; // Center the 50px cursor
    dustCursor.style.top = (e.clientY - 25) + 'px';
});

// Reveal effect on click/drag
let isMouseDown = false;

document.addEventListener('mousedown', () => {
    isMouseDown = true;
    dustCursor.classList.add('sprinkling');
});

document.addEventListener('mouseup', () => {
    isMouseDown = false;
    dustCursor.classList.remove('sprinkling');
});

document.addEventListener('mousemove', (e) => {
    if (isMouseDown && !isRevealing) {
        createSprinkleEffect(e.clientX, e.clientY);
        createRevealCircle(e.clientX, e.clientY);
        revealProgress++;
        
        if (revealProgress >= revealThreshold) {
            startFullReveal();
        }
    }
});

// Auto-sprinkle on just moving (lighter effect)
document.addEventListener('mousemove', (e) => {
    if (!isRevealing && Math.random() < 0.3) {
        createLightSprinkle(e.clientX, e.clientY);
    }
});

function createSprinkleEffect(x, y) {
    for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        const isGold = Math.random() > 0.5;
        particle.className = isGold ? 'sprinkle-particle gold' : 'sprinkle-particle purple';
        
        const offsetX = (Math.random() - 0.5) * 40;
        const offsetY = (Math.random() - 0.5) * 40;
        
        particle.style.left = (x + offsetX) + 'px';
        particle.style.top = (y + offsetY) + 'px';
        
        document.body.appendChild(particle);
        
        setTimeout(() => {
            particle.remove();
        }, 1500);
    }
}

function createLightSprinkle(x, y) {
    const particle = document.createElement('div');
    const isGold = Math.random() > 0.7;
    particle.className = isGold ? 'sprinkle-particle gold' : 'sprinkle-particle purple';
    
    const offsetX = (Math.random() - 0.5) * 20;
    const offsetY = (Math.random() - 0.5) * 20;
    
    particle.style.left = (x + offsetX) + 'px';
    particle.style.top = (y + offsetY) + 'px';
    particle.style.opacity = '0.6';
    
    document.body.appendChild(particle);
    
    setTimeout(() => {
        particle.remove();
    }, 1000);
}

function createRevealCircle(x, y) {
    const circle = document.createElement('div');
    circle.className = 'reveal-circle';
    circle.style.left = (x - 150) + 'px';
    circle.style.top = (y - 150) + 'px';
    
    document.getElementById('reveal-canvas').appendChild(circle);
    
    setTimeout(() => {
        circle.remove();
    }, 2000);
}

function startFullReveal() {
    if (isRevealing) return;
    isRevealing = true;
    
    const overlay = document.getElementById('dust-reveal-overlay');
    const instructions = document.querySelector('.reveal-instructions');
    
    // Hide instructions
    instructions.style.opacity = '0';
    instructions.style.transform = 'scale(0.8)';
    
    // Create massive sprinkle explosion
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const x = Math.random() * window.innerWidth;
            const y = Math.random() * window.innerHeight;
            createSprinkleEffect(x, y);
        }, i * 50);
    }
    
    // Gradually reveal the site
    setTimeout(() => {
        overlay.classList.add('revealing');
        document.body.style.cursor = 'default';
        dustCursor.style.display = 'none';
        
        setTimeout(() => {
            overlay.classList.add('hidden');
            startMainSiteAnimation();
        }, 1000);
    }, 2000);
}

function startMainSiteAnimation() {
    // Start the main site dust animation
    setInterval(createDustParticle, 200);
    
    // Initial burst of particles
    for (let i = 0; i < 50; i++) {
        setTimeout(createDustParticle, i * 100);
    }
    
    // Initialize the dust canvas after reveal
    initializeDustCanvas();
}

// Initialize the dust canvas
function initializeDustCanvas() {
    // Wait a bit to ensure the canvas is visible
    setTimeout(() => {
        const canvas = document.getElementById('dustCanvas');
        if (canvas && !dustCanvasInstance) {
            dustCanvasInstance = new DustCanvas();
        }
    }, 500);
}

//CANVAS

// DustCanvas Class for Interactive Drawing
function DustCanvas() {
    this.canvas = document.getElementById('dustCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.isDrawing = false;
    this.currentColor = 'gold';
    this.brushSize = 1.5;
    this.particleCount = 0;
    this.groundParticles = [];
    
    this.colorMap = {
        gold: { gradient: ['#ffd700', '#ffec8b', '#d4af37'], glow: 'rgba(255, 215, 0, 0.8)' },
        purple: { gradient: ['#a855f7', '#c084fc', '#8b5cf6'], glow: 'rgba(168, 85, 247, 0.8)' },
        blue: { gradient: ['#3b82f6', '#60a5fa', '#1d4ed8'], glow: 'rgba(59, 130, 246, 0.8)' },
        green: { gradient: ['#10b981', '#34d399', '#059669'], glow: 'rgba(16, 185, 129, 0.8)' },
        red: { gradient: ['#ef4444', '#f87171', '#dc2626'], glow: 'rgba(239, 68, 68, 0.8)' },
        pink: { gradient: ['#ec4899', '#f472b6', '#be185d'], glow: 'rgba(236, 72, 153, 0.8)' }
    };
    
    this.init();
}

DustCanvas.prototype.init = function() {
    this.resizeCanvas();
    this.bindEvents();
    this.animate();
    
    window.addEventListener('resize', () => this.resizeCanvas());
};

DustCanvas.prototype.resizeCanvas = function() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.ctx.fillStyle = 'rgba(45, 27, 105, 0.9)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
};

DustCanvas.prototype.bindEvents = function() {
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseout', () => this.stopDrawing());
    
    this.canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.startDrawing(e.touches[0]);
    });
    this.canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        this.draw(e.touches[0]);
    });
    this.canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.stopDrawing();
    });
    
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('.color-btn.active').classList.remove('active');
            e.target.classList.add('active');
            this.currentColor = e.target.dataset.color;
        });
    });
    
    document.getElementById('brushSize').addEventListener('input', (e) => {
        this.brushSize = parseFloat(e.target.value);
    });
    
    document.getElementById('clearCanvas').addEventListener('click', () => {
        this.clearCanvas();
    });
    
    document.getElementById('downloadBtn').addEventListener('click', () => {
        this.downloadCanvas();
    });
    
    document.getElementById('shareBtn').addEventListener('click', () => {
        this.shareOnTwitter();
    });
};

DustCanvas.prototype.getMousePos = function(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
};

DustCanvas.prototype.startDrawing = function(e) {
    this.isDrawing = true;
    this.draw(e);
};

DustCanvas.prototype.draw = function(e) {
    if (!this.isDrawing) return;
    
    const pos = this.getMousePos(e);
    
    for (let i = 0; i < 6; i++) {
        const particle = {
            x: pos.x + (Math.random() - 0.5) * 8,
            y: pos.y + (Math.random() - 0.5) * 2,
            size: this.brushSize + Math.random() * 0.5,
            color: this.currentColor,
            life: 1.0,
            vx: (Math.random() - 0.5) * 0.2,
            vy: Math.random() * 0.5 + 0.1,
            gravity: 0.03,
            friction: 0.99,
            settled: false
        };
        
        this.particles.push(particle);
        this.particleCount++;
    }
    
    this.updateParticleCount();
};

DustCanvas.prototype.stopDrawing = function() {
    this.isDrawing = false;
};

DustCanvas.prototype.animate = function() {
    this.ctx.fillStyle = 'rgba(45, 27, 105, 0.9)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
        const particle = this.particles[i];
        
        if (particle.settled) continue;
        
        particle.vy += particle.gravity;
        particle.vx *= particle.friction;
        particle.vy *= particle.friction;
        
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        const groundY = this.canvas.height - 10;
        let collided = false;
        
        for (let settled of this.groundParticles) {
            const dx = particle.x - settled.x;
            const dy = particle.y - settled.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = particle.size + settled.size;
            
            if (distance < minDistance) {
                particle.y = settled.y - minDistance + 1;
                particle.vy = 0;
                particle.vx *= 0.5;
                collided = true;
                break;
            }
        }
        
        if (particle.y >= groundY - particle.size) {
            particle.y = groundY - particle.size;
            particle.vy = 0;
            particle.vx *= 0.7;
            collided = true;
        }
        
        if (collided && Math.abs(particle.vx) < 0.1 && Math.abs(particle.vy) < 0.1) {
            particle.settled = true;
            this.groundParticles.push({
                x: particle.x,
                y: particle.y,
                size: particle.size,
                color: particle.color
            });
            this.particles.splice(i, 1);
        }
    }
    
    this.redrawCanvas();
    
    requestAnimationFrame(() => this.animate());
};

DustCanvas.prototype.redrawCanvas = function() {
    this.ctx.fillStyle = 'rgba(45, 27, 105, 0.9)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (let settled of this.groundParticles) {
        this.drawParticle(settled.x, settled.y, settled.size, settled.color, 1.0);
    }
    
    for (let particle of this.particles) {
        if (!particle.settled) {
            this.drawParticle(particle.x, particle.y, particle.size, particle.color, 1.0);
        }
    }
};

DustCanvas.prototype.drawParticle = function(x, y, size, colorName, alpha) {
    const colorData = this.colorMap[colorName];
    
    this.ctx.save();
    this.ctx.fillStyle = this.hexToRgba(colorData.gradient[0], alpha);
    this.ctx.beginPath();
    this.ctx.arc(x, y, size, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = this.hexToRgba(colorData.gradient[1], alpha * 0.7);
    this.ctx.beginPath();
    this.ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
};

DustCanvas.prototype.updateParticleCount = function() {
    document.getElementById('particleCount').textContent = this.groundParticles.length + this.particles.length;
};

DustCanvas.prototype.hexToRgba = function(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

DustCanvas.prototype.downloadCanvas = function() {
    const link = document.createElement('a');
    link.download = 'magic-dust-art.png';
    link.href = this.canvas.toDataURL();
    link.click();
};

DustCanvas.prototype.shareOnTwitter = function() {
    const text = "Check out my magical dust art created with Magic Trench Dust! ✨🎨 Never sell your dust! @DontSellDust #MagicTrenchDust #DigitalArt #Crypto";
    const url = encodeURIComponent("https://magictrenchdust.com");
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`;
    window.open(twitterUrl, '_blank');
};

DustCanvas.prototype.clearCanvas = function() {
    this.particles = [];
    this.groundParticles = [];
    this.particleCount = 0;
    this.ctx.fillStyle = 'rgba(45, 27, 105, 0.9)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.updateParticleCount();
};


////////


// Dust particle animation
function createDustParticle() {
    const dust = document.createElement('div');
    const isGold = Math.random() > 0.6; // 40% gold, 60% purple
    dust.className = isGold ? 'dust-particle gold' : 'dust-particle purple';
    
    const size = Math.random() * 4 + 2;
    dust.style.width = size + 'px';
    dust.style.height = size + 'px';
    dust.style.left = Math.random() * 100 + '%';
    dust.style.animationDuration = (Math.random() * 8 + 4) + 's';
    dust.style.animationDelay = Math.random() * 2 + 's';
    dust.style.opacity = Math.random() * 0.8 + 0.2;
    
    document.getElementById('dust-container').appendChild(dust);
    
    setTimeout(() => {
        dust.remove();
    }, 12000);
}

// Copy contract address function
function copyContract() {
    const contractText = document.getElementById('contract').textContent;
    navigator.clipboard.writeText(contractText).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied! ✓';
        btn.style.background = '#28a745';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = 'linear-gradient(45deg, #ffd700, #ffec8b, #d4af37)';
        }, 2000);
    });
}

// Smooth scrolling for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Particle interaction with mouse (only after reveal)
document.addEventListener('mousemove', (e) => {
    if (isRevealing && Math.random() < 0.1) {
        const dust = document.createElement('div');
        const isGold = Math.random() > 0.5;
        dust.className = isGold ? 'dust-particle gold' : 'dust-particle purple';
        dust.style.width = '3px';
        dust.style.height = '3px';
        dust.style.left = e.clientX + 'px';
        dust.style.top = e.clientY + 'px';
        dust.style.position = 'fixed';
        dust.style.animationDuration = '2s';
        dust.style.opacity = '0.6';
        document.body.appendChild(dust);
        
        setTimeout(() => dust.remove(), 2000);
    }
});

// Initialize canvas when DOM is loaded (fallback)
document.addEventListener('DOMContentLoaded', function() {
    // If the reveal hasn't happened yet, wait for it
    if (!isRevealing) {
        // Set up an observer to initialize canvas when it becomes visible
        const canvas = document.getElementById('dustCanvas');
        if (canvas) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !dustCanvasInstance) {
                        dustCanvasInstance = new DustCanvas();
                        observer.unobserve(canvas);
                    }
                });
            });
            observer.observe(canvas);
        }
    }
});