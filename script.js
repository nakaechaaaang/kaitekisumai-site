/* 快住 - script.js */

document.addEventListener('DOMContentLoaded', () => {
  // --- Hamburger Menu ---
  const hamburger = document.getElementById('hamburger');
  const globalNav = document.getElementById('globalNav');

  if (hamburger && globalNav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('is-open');
      globalNav.classList.toggle('is-open');
      document.body.style.overflow = globalNav.classList.contains('is-open') ? 'hidden' : '';
    });

    // Close menu when a nav link is clicked
    globalNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('is-open');
        globalNav.classList.remove('is-open');
        document.body.style.overflow = '';
      });
    });
  }

  // --- Scroll animation (fade-in) ---
  const observerOptions = { threshold: 0.15, rootMargin: '0px 0px -40px 0px' };
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.service-card, .point-item, .news-item, .contact-box, .company-row').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
    fadeObserver.observe(el);
  });

  // Add visible styles
  const style = document.createElement('style');
  style.textContent = '.is-visible { opacity: 1 !important; transform: translateY(0) !important; }';
  document.head.appendChild(style);

  // --- Header scroll shadow ---
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        header.style.boxShadow = '0 2px 20px rgba(0,0,0,.1)';
      } else {
        header.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)';
      }
    }, { passive: true });
  }
});
