/* ======================= */
/*   DEPLOYIFY — app.js    */
/* ======================= */

// ===== NAVBAR SCROLL =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// ===== HAMBURGER MENU =====
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
});

// Close mobile menu on link click
mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileMenu.classList.remove('open');
  });
});

// ===== SMOOTH SCROLL =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#' || href === '#docs') return;
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ===== SCROLL REVEAL =====
const revealElements = document.querySelectorAll(
  '.feat-card, .db-card, .price-card, .testi-card, .step, .deploy-steps, .frameworks, .code-snippet'
);
revealElements.forEach((el, i) => {
  el.classList.add('reveal');
  if (i % 3 === 1) el.classList.add('reveal-delay-1');
  if (i % 3 === 2) el.classList.add('reveal-delay-2');
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
);
revealElements.forEach(el => revealObserver.observe(el));

// ===== FEAT CARD MOUSE GLOW =====
document.querySelectorAll('.feat-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', x + '%');
    card.style.setProperty('--mouse-y', y + '%');
  });
});

// ===== CODE SNIPPET TABS =====
function switchTab(lang) {
  // Update tab buttons
  document.querySelectorAll('.snippet-tab').forEach(tab => {
    tab.classList.toggle('active', tab.id === `tab-${lang}`);
  });
  // Update code panes
  document.querySelectorAll('.snippet-code').forEach(code => {
    code.classList.toggle('active', code.id === `snippet-${lang}`);
  });
}
window.switchTab = switchTab;

// ===== BILLING TOGGLE =====
function toggleBilling() {
  const toggle = document.getElementById('billing-toggle');
  const isAnnual = toggle.checked;
  document.querySelectorAll('.price-amount[data-monthly]').forEach(el => {
    const monthly = parseInt(el.dataset.monthly);
    const annual = parseInt(el.dataset.annual);
    if (!isNaN(monthly) && !isNaN(annual)) {
      const val = isAnnual ? annual : monthly;
      el.textContent = val === 0 ? '$0' : `$${val}`;
      // Animate number change
      el.style.transform = 'scale(0.85)';
      el.style.opacity = '0.5';
      setTimeout(() => {
        el.style.transform = 'scale(1)';
        el.style.opacity = '1';
        el.style.transition = 'all 0.3s ease';
      }, 80);
    }
  });

  // Toggle label highlights
  document.getElementById('lbl-monthly').style.color = isAnnual ? 'var(--text-dim)' : 'var(--text)';
  document.getElementById('lbl-annual').style.color = isAnnual ? 'var(--text)' : 'var(--text-dim)';
}
window.toggleBilling = toggleBilling;

// ===== TERMINAL ANIMATION =====
function restartTerminal() {
  const lines = document.querySelectorAll('.t-fade');
  lines.forEach(line => {
    line.style.animation = 'none';
    line.offsetHeight; // reflow
    line.style.animation = '';
  });
}
// Re-trigger on scroll into view
const terminal = document.getElementById('terminal');
if (terminal) {
  const termObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        restartTerminal();
        termObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  termObserver.observe(terminal);
}

// ===== COUNTER ANIMATION =====
function animateCounter(el, target, suffix = '') {
  const duration = 1800;
  const start = performance.now();
  const startVal = 0;
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const val = Math.floor(startVal + (target - startVal) * ease);
    el.textContent = val + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target + suffix;
  }
  requestAnimationFrame(step);
}

const statsEl = document.getElementById('hero-stats');
if (statsEl) {
  let statsAnimated = false;
  const statsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !statsAnimated) {
      statsAnimated = true;
      // Animate the "100+" stat
      const nums = document.querySelectorAll('.stat-num');
      nums.forEach(el => {
        const text = el.textContent.trim();
        if (text === '100+') animateCounter(el, 100, '+');
        if (text === '2.4s') {
          let count = 0;
          const iv = setInterval(() => {
            count += 0.1;
            el.textContent = count.toFixed(1) + 's';
            if (count >= 2.4) { el.textContent = '2.4s'; clearInterval(iv); }
          }, 60);
        }
      });
    }
  }, { threshold: 0.5 });
  statsObserver.observe(statsEl);
}

// ===== LOGO STRIP PAUSE ON HOVER =====
const logoTrack = document.querySelector('.logo-track');
if (logoTrack) {
  logoTrack.addEventListener('mouseenter', () => {
    logoTrack.style.animationPlayState = 'paused';
  });
  logoTrack.addEventListener('mouseleave', () => {
    logoTrack.style.animationPlayState = 'running';
  });
}

// ===== HERO BADGE CLICK RIPPLE =====
const heroBadge = document.getElementById('hero-badge');
if (heroBadge) {
  heroBadge.addEventListener('click', (e) => {
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position:absolute;width:4px;height:4px;border-radius:50%;
      background:rgba(139,92,246,0.5);
      top:${e.offsetY}px;left:${e.offsetX}px;
      transform:scale(0);animation:ripple 0.6s ease-out forwards;
      pointer-events:none;
    `;
    heroBadge.style.position = 'relative';
    heroBadge.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
}

// Add ripple keyframes dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes ripple {
    to { transform: scale(80); opacity: 0; }
  }
`;
document.head.appendChild(style);

// ===== DB CARD HOVER GLOW =====
document.querySelectorAll('.db-card').forEach(card => {
  card.addEventListener('mouseenter', () => {
    card.style.boxShadow = '0 12px 48px rgba(59,130,246,0.12)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.boxShadow = '';
  });
});

// ===== FW BADGE STAGGER =====
const fwBadges = document.querySelectorAll('.fw-badge');
fwBadges.forEach((badge, i) => {
  badge.style.opacity = '0';
  badge.style.transform = 'translateY(16px)';
  badge.style.transition = `all 0.4s ease ${i * 0.06}s`;
});

const fwSection = document.getElementById('frameworks');
if (fwSection) {
  const fwObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      fwBadges.forEach(badge => {
        badge.style.opacity = '1';
        badge.style.transform = 'translateY(0)';
      });
      fwObserver.unobserve(entries[0].target);
    }
  }, { threshold: 0.3 });
  fwObserver.observe(fwSection);
}

// ===== TESTI CARD STAGGER =====
document.querySelectorAll('.testi-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 0.1}s`;
});

// ===== CTA BUTTON SPARKLE =====
document.querySelectorAll('.btn-primary').forEach(btn => {
  btn.addEventListener('mouseenter', function() {
    this.style.transform = 'translateY(-2px)';
  });
  btn.addEventListener('mouseleave', function() {
    this.style.transform = '';
  });
});

// ===== ACTIVE NAV LINK ON SCROLL =====
const sections = ['hero', 'features', 'deploy', 'database', 'pricing'];
const navLinks = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY + 120;
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.offsetTop;
      const height = el.offsetHeight;
      if (scrollY >= top && scrollY < top + height) {
        navLinks.forEach(link => {
          link.style.color = '';
          if (link.getAttribute('href') === `#${id}`) {
            link.style.color = 'var(--text)';
          }
        });
      }
    }
  });
}, { passive: true });

console.log('%c🚀 Deployify', 'font-size:24px;font-weight:900;background:linear-gradient(90deg,#8b5cf6,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;');
console.log('%cDeploy fast. Scale instantly. Free forever.', 'color:#7b7b99;font-size:13px;');
