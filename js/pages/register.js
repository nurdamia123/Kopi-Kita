/* ==========================================================
   Kopi Kita - js/pages/register.js  (Register tab on index.html)
   Purpose: Check every field, show clear error messages,
            save the new account and send the user to login.
   ========================================================== */
(function () {
  const $ = id => document.getElementById(id);
  const form = $('regForm');
  const f = { name: $('rName'), user: $('rUser'), role: $('rRole'), email: $('rEmail'), phone: $('rPhone'), pass: $('rPass'), confirm: $('rConfirm'), terms: $('rTerms') };

  /* Rules for each field. Each returns an error message, or '' if OK */
  const rules = {
    name: v => v.trim().length >= 3 && /^[A-Za-z@'.\s/-]+$/.test(v.trim()) ? '' : 'Please enter your full name (letters only, at least 3).',
    user: v => {
      if (!/^[A-Za-z0-9_]{4,15}$/.test(v)) return '4-15 characters: letters, numbers or _ only.';
      if (KK.findUser(v)) return 'This username is already taken. Please choose another.';
      return '';
    },
    role: v => v ? '' : 'Please choose your position.',
    email: v => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Please enter a valid email address.';
      if (KK.users().some(u => (u.email || '').toLowerCase() === v.toLowerCase())) return 'This email is already registered.';
      return '';
    },
    phone: v => !v || /^0\d{1,2}-?\d{3,4} ?\d{4}$/.test(v.trim()) ? '' : 'Example: 012-345 6789',
    pass: v => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v) ? '' : 'At least 8 characters with letters and numbers.',
    confirm: v => v && v === f.pass.value ? '' : 'Passwords do not match.',
    terms: (v, el) => el.checked ? '' : 'You must agree before continuing.'
  };

  function check(key) {
    const el = f[key];
    const msg = rules[key](el.value, el);
    el.setCustomValidity(msg);
    const fb = el.closest('div').querySelector('.invalid-feedback') || el.parentElement.querySelector('.invalid-feedback');
    if (fb && msg) fb.textContent = msg;
    el.classList.toggle('is-invalid', !!msg && form.dataset.touched === '1');
    el.classList.toggle('is-valid', !msg && form.dataset.touched === '1' && key !== 'terms' && (el.value || key === 'phone'));
    return !msg;
  }

  /* Live checking after the first submit attempt */
  Object.keys(f).forEach(k => f[k].addEventListener(k === 'terms' || k === 'role' ? 'change' : 'input', () => {
    check(k);
    if (k === 'pass' && f.confirm.value) check('confirm');
  }));

  /* Password strength meter */
  f.pass.addEventListener('input', () => {
    const v = f.pass.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const levels = [['0%', '#e8e5e0', 'Use 8+ characters with letters and numbers.'], ['25%', '#b5534a', 'Weak'], ['50%', '#c08a33', 'Fair'], ['75%', '#7a5235', 'Good'], ['100%', '#5f8a66', 'Strong']];
    const [w, c, t] = levels[v ? score : 0];
    $('pwBar').style.width = w; $('pwBar').style.background = c; $('pwText').textContent = t;
  });

  $('togglePw2').addEventListener('click', function () {
    const show = f.pass.type === 'password';
    f.pass.type = f.confirm.type = show ? 'text' : 'password';
    this.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
  });

  $('termsLink').addEventListener('click', e => {
    e.preventDefault();
    KK.modal({
      title: 'Terms of use', size: 'lg',
      body: `<ol class="small mb-0"><li>This account is for Kopi Kita staff only.</li><li>Keep your password private.</li>
        <li>Customer data must only be used for cafe operations.</li><li>This is a student prototype; data is stored only in your browser.</li></ol>`,
      footer: '<button class="btn btn-primary" data-bs-dismiss="modal" id="agreeBtn">I agree</button>',
      onShown: el => el.querySelector('#agreeBtn').addEventListener('click', () => { f.terms.checked = true; check('terms'); })
    });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    form.dataset.touched = '1';
    const ok = Object.keys(f).map(check).every(Boolean);
    if (!ok) {
      form.querySelector('.is-invalid')?.focus();
      KK.toast('Please fix the highlighted fields.', 'error');
      return;
    }
    const user = {
      name: f.name.value.trim(), username: f.user.value.trim(), email: f.email.value.trim(),
      phone: f.phone.value.trim(), password: f.pass.value, position: f.role.value
    };
    KK.register(user);
    KK.modal({
      title: '<i class="bi bi-check-circle text-success me-2"></i>Account created',
      size: 'sm',
      body: `<p class="mb-2">Welcome to Kopi Kita, <strong>${KK.esc(user.name)}</strong>!</p>
             <div class="demo-box"><div>Username: <code>${KK.esc(user.username)}</code></div><div>Position: ${KK.esc(user.position)}</div></div>`,
      footer: `<button class="btn btn-primary w-100" data-bs-dismiss="modal" id="goLogin">Go to sign in</button>`,
      onShown: el => el.querySelector('#goLogin').addEventListener('click', () => KK.afterRegister(user.username))
    });
    form.reset(); form.dataset.touched = '0';
    form.querySelectorAll('.is-valid, .is-invalid').forEach(x => x.classList.remove('is-valid', 'is-invalid'));
    $('pwBar').style.width = '0';
  });
})();
