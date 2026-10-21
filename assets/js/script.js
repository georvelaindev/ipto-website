// IPTO — script.js JavaScript sans dépendance, chargé sur toutes les pages (defer). Chaque module s'auto-désactive si les éléments ciblés n'existent pas.
(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Active un élément au clic ET au clavier (Entrée / Espace) */
  const onActivate = (el, handler) => {
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    });
  };

  // menu mobile
  function initNav() {
    const header = $('.navbar');
    const menu = $('#nav-menu');
    const openBtn = $('#toggle');
    const closeBtn = $('#nav-fermer');

    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    const current = $('.nav-links a.actif');
    if (current) current.setAttribute('aria-current', 'page');

    if (!header || !menu || !openBtn) return;

    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    header.append(overlay);

    openBtn.setAttribute('role', 'button');
    openBtn.setAttribute('tabindex', '0');
    openBtn.setAttribute('aria-label', 'Ouvrir le menu');
    openBtn.setAttribute('aria-controls', 'nav-menu');
    openBtn.setAttribute('aria-expanded', 'false');
    if (closeBtn) {
      closeBtn.setAttribute('role', 'button');
      closeBtn.setAttribute('tabindex', '0');
      closeBtn.setAttribute('aria-label', 'Fermer le menu');
    }

    const setOpen = (open, restoreFocus = false) => {
      menu.classList.toggle('show-menu', open);
      overlay.classList.toggle('visible', open);
      document.body.classList.toggle('no-scroll', open);
      openBtn.setAttribute('aria-expanded', String(open));
      if (open && closeBtn) closeBtn.focus();
      if (!open && restoreFocus) openBtn.focus();
    };

    onActivate(openBtn, () => setOpen(true));
    if (closeBtn) onActivate(closeBtn, () => setOpen(false, true));
    overlay.addEventListener('click', () => setOpen(false));
    $$('.nav-links a', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('show-menu')) setOpen(false, true);
    });
    window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => {
      if (e.matches) setOpen(false);
    });
  }

  // un <button> qui contient un lien : tout le bouton est cliquable
  function initButtonLinks() {
    $$('button > a[href]').forEach((a) => {
      a.parentElement.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        a.click();
      });
    });
  }

  // bouton retour en haut
  function initBackToTop() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Retour en haut de la page');
    btn.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
    document.body.append(btn);

    const toggle = () => btn.classList.toggle('visible', window.scrollY > 500);
    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
    btn.addEventListener('click', () =>
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    );
  }

  // apparition des blocs au défilement
  function initReveal() {
    if (prefersReducedMotion || !('IntersectionObserver' in window)) return;

    const selectors = [
      '.mission-box', '#value .ions_box', '.qualite', '.formations', '.commend-box',
      '#value-place .ions_box', '.process-container', '.frais-container',
      '.cycle-container', '.questions', '.souvs-evens', '.sous-img', '.field-icons .box',
      '.baner-container .text-box', '.baner-container .image-container', '.speach-box',
      '.text-about', '.info-need', '.message-container', '[data-reveal]'
    ].join(',');

    const els = $$(selectors);
    if (!els.length) return;

    els.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 4) * 90}ms`;
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add('visible');
          io.unobserve(el);
          // Nettoyage pour ne pas interférer avec les effets :hover existants
          setTimeout(() => {
            el.classList.remove('reveal', 'visible');
            el.style.transitionDelay = '';
          }, 1100);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
  }

  // chiffres qui montent
  function initCounters() {
    const els = $$('.field-icons .box h2, [data-counter]');
    if (!els.length || prefersReducedMotion || !('IntersectionObserver' in window)) return;

    const parse = (text) => {
      const m = text.trim().match(/^(\d+)(.*)$/);
      return m ? { value: parseInt(m[1], 10), suffix: m[2] } : null;
    };

    const animate = (el, { value, suffix }) => {
      const duration = 1600;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(value * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const data = parse(entry.target.textContent);
          io.unobserve(entry.target);
          if (data) animate(entry.target, data);
        });
      },
      { threshold: 0.6 }
    );
    els.forEach((el) => io.observe(el));
  }


  // liens pas encore actifs : petit message
  function initSoon() {
    const links = $$('[data-soon]');
    if (!links.length) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.append(toast);

    let timer;
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        toast.textContent = link.dataset.soon || 'Bientôt disponible.';
        toast.classList.add('visible');
        clearTimeout(timer);
        timer = setTimeout(() => toast.classList.remove('visible'), 3200);
      });
    });
  }


  // témoignages : défilement auto, points, pause au survol
  function initCarousel() {
    const root = $('[data-carousel]');
    if (!root) return;
    const slides = $$('.t-slide', root);
    const dotsWrap = $('.t-dots', root);
    if (slides.length < 2 || !dotsWrap) return;

    const INTERVAL = 5000;
    let index = 0;
    let timer = null;
    let hovered = false;
    let focused = false;

    const go = (i) => {
      index = (i + slides.length) % slides.length;
      slides.forEach((slide, k) => {
        const on = k === index;
        slide.classList.toggle('is-active', on);
        slide.setAttribute('aria-hidden', String(!on));
      });
      dots.forEach((dot, k) => {
        dot.classList.toggle('is-active', k === index);
        dot.setAttribute('aria-current', String(k === index));
      });
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      if (prefersReducedMotion || hovered || focused) return;
      stop();
      timer = setInterval(() => go(index + 1), INTERVAL);
    };
    const restart = () => { stop(); start(); };

    const dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 't-dot';
      dot.setAttribute('aria-label', `Témoignage ${i + 1} sur ${slides.length}`);
      dot.addEventListener('click', () => { go(i); restart(); });
      dotsWrap.append(dot);
      return dot;
    });

    // Pause au survol (souris uniquement) et à la navigation clavier
    root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovered = true; stop(); } });
    root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hovered = false; start(); } });
    root.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focused = true; stop(); } });
    root.addEventListener('focusout', () => { focused = false; start(); });

    let startX = null;
    root.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) { go(index + (dx < 0 ? 1 : -1)); restart(); }
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    go(0);
    start();
  }


  // page formations : filtres, programme déployable, lien direct vers une filière
  function initFilieres() {
    const grid = $('[data-filieres]');
    if (!grid) return;
    const cards = $$('[data-filiere]', grid);
    const buttons = $$('[data-filter]');

    const setOpen = (card, open) => {
      const toggle = $('.fcard-toggle', card);
      if (!toggle) return;
      card.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      $('span', toggle).textContent = open ? 'Masquer le programme' : 'Voir le programme';
    };

    cards.forEach((card) => {
      const toggle = $('.fcard-toggle', card);
      if (toggle) toggle.addEventListener('click', () => setOpen(card, !card.classList.contains('open')));
    });

    const applyFilter = (filter) => {
      cards.forEach((card) => {
        const show = filter === 'all' || card.dataset.statut === filter;
        card.hidden = !show;
      });
      buttons.forEach((b) => {
        const on = b.dataset.filter === filter;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };
    buttons.forEach((b) => b.addEventListener('click', () => applyFilter(b.dataset.filter)));

    // /formation.html#civil : ouvre la carte et la met en évidence
    const fromHash = () => {
      const card = cards.find((c) => c.id === location.hash.slice(1));
      if (!card) return;
      applyFilter('all');
      setOpen(card, true);
      card.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
      card.classList.add('is-focus');
      setTimeout(() => card.classList.remove('is-focus'), 3000);
    };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }


  // agrandir une image au clic (attribut data-lightbox)
  function initLightbox() {
    const images = $$('[data-lightbox]');
    if (!images.length) return;

    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Image agrandie');
    box.innerHTML = '<button type="button" class="lightbox-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">';
    document.body.append(box);
    const big = $('img', box);
    const closeBtn = $('.lightbox-close', box);
    let origin = null;

    const hide = () => {
      box.classList.remove('visible');
      document.body.classList.remove('no-scroll');
      if (origin) origin.focus();
    };
    const show = (img) => {
      origin = img;
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      box.classList.add('visible');
      document.body.classList.add('no-scroll');
      closeBtn.focus();
    };

    images.forEach((img) => {
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `${img.alt || 'Image'} : agrandir`);
      img.addEventListener('click', () => show(img));
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(img); }
      });
    });
    box.addEventListener('click', (e) => { if (e.target !== big) hide(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && box.classList.contains('visible')) hide();
    });
  }

  // événements : badge « terminé » ou « à venir » selon la date
  function initEvents() {
    const cards = $$('.souvs-evens, [data-event]');
    if (!cards.length) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let upcoming = 0;

    cards.forEach((card) => {
      const dateEl = $('[data-date]', card);
      if (!dateEl) return;
      const [y, m, d] = dateEl.dataset.date.split('-').map(Number);
      const isPast = new Date(y, m - 1, d) < today;

      card.classList.add(isPast ? 'is-past' : 'is-upcoming');
      const badge = document.createElement('span');
      badge.className = 'event-badge';
      badge.textContent = isPast ? 'Terminé' : 'À venir';
      card.prepend(badge);
      if (!isPast) upcoming += 1;
    });

    const title = $('.evens-container > p');
    if (!title) return;
    title.textContent = upcoming ? 'Événements à venir' : 'Événements récents';
    if (!upcoming) {
      const note = document.createElement('p');
      note.className = 'events-empty';
      note.textContent = 'Aucun événement à venir pour le moment. Revenez bientôt !';
      title.after(note);
    }
  }

  // questions fréquentes (page contact)
  function initFaq() {
    const items = $$('.question-box .questions');
    if (!items.length) return;

    items.forEach((item, i) => {
      const question = $('h3', item);
      const answer = $('p', item);
      if (!question || !answer) return;

      answer.id = `faq-reponse-${i}`;
      question.setAttribute('role', 'button');
      question.setAttribute('tabindex', '0');
      question.setAttribute('aria-controls', answer.id);

      const set = (open) => {
        item.classList.toggle('open', open);
        question.setAttribute('aria-expanded', String(open));
        answer.style.maxHeight = open ? `${answer.scrollHeight}px` : '0px';
      };
      set(i === 0);
      onActivate(question, () => set(!item.classList.contains('open')));
    });

    window.addEventListener('resize', () => {
      items.forEach((item) => {
        if (!item.classList.contains('open')) return;
        const answer = $('p', item);
        if (answer) answer.style.maxHeight = `${answer.scrollHeight}px`;
      });
    });
  }

  // formulaire de contact : vérification et envoi (Formspree)
  function initContactForm() {
    const form = $('form.message-box');
    if (!form) return;

    form.noValidate = true; // on affiche nos propres messages
    const status = $('.form-status', form);
    const submitBtn = $('button[type="submit"]', form);
    const submitHTML = submitBtn ? submitBtn.innerHTML : '';

    const isPhone = (value) => {
      const v = value.replace(/[\s.\-()]/g, '');
      if (/^\+(?!242)\d{8,15}$/.test(v)) return true; // autre pays
      const local = v.replace(/^(\+242|00242)/, '');
      return /^0?\d{8}$/.test(local); // numéro congolais
    };

    const rules = {
      nom: (v) => v.trim().length >= 3 || 'Entrez votre nom complet (3 caractères minimum).',
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Entrez une adresse e-mail valide.',
      tel: (v) => isPhone(v) || 'Entrez un numéro valide, ex. : +242 06 123 45 67.',
      sujet: (v) => v !== '' || 'Choisissez un sujet.',
      message: (v) => v.trim().length >= 10 || 'Votre message est trop court (10 caractères minimum).'
    };

    const setError = (field, message) => {
      const wrap = field.closest('.massaging');
      if (!wrap) return !message;
      wrap.classList.toggle('has-error', Boolean(message));
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
      let err = $('.field-error', wrap);
      if (message) {
        if (!err) {
          err = document.createElement('span');
          err.className = 'field-error';
          err.id = `${field.id}-erreur`;
          wrap.append(err);
          field.setAttribute('aria-describedby', err.id);
        }
        err.textContent = message;
      } else if (err) {
        err.remove();
        field.removeAttribute('aria-describedby');
      }
      return !message;
    };

    const check = (field) => {
      const rule = rules[field.name];
      if (!rule) return true;
      const result = rule(field.value);
      return setError(field, result === true ? '' : result);
    };

    const showStatus = (type, message) => {
      if (!status) return;
      status.className = `form-status ${type}`;
      status.textContent = message;
    };

    const fields = Array.from(form.elements).filter((el) => rules[el.name]);

    fields.forEach((field) => {
      field.addEventListener('blur', () => check(field));
      const live = () => { if (field.closest('.massaging')?.classList.contains('has-error')) check(field); };
      field.addEventListener('input', live);
      field.addEventListener('change', live);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Champ pot-de-miel anti-spam : un humain ne le remplit jamais
      const trap = form.elements['_gotcha'];
      if (trap && trap.value) {
        showStatus('success', 'Merci ! Votre message a bien été envoyé.');
        return;
      }

      const results = fields.map(check);
      const firstInvalid = results.indexOf(false);
      if (firstInvalid !== -1) {
        fields[firstInvalid].focus();
        showStatus('error', 'Veuillez corriger les champs signalés en rouge.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>  Envoi en cours…';
      }
      showStatus('', '');

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        form.reset();
        fields.forEach((f) => setError(f, ''));
        showStatus('success', 'Merci ! Votre message a bien été envoyé. Nous vous répondrons dans les meilleurs délais.');
      } catch (err) {
        showStatus('error', "L'envoi a échoué. Vérifiez votre connexion et réessayez, ou écrivez-nous directement par e-mail.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitHTML;
        }
      }
    });
  }

  // lancement
  initNav();
  initButtonLinks();
  initBackToTop();
  initReveal();
  initCounters();
  initSoon();
  initCarousel();
  initEvents();
  initFaq();
  initFilieres();
  initLightbox();
  initContactForm();
})();
