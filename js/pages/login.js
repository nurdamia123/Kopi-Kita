/* ==========================================================
   Kopi Kita - js/pages/login.js  (index.html)
   Purpose: Admin sign in. Only ONE admin account exists
            (set in js/app.js). There is no register page.
            The username and password are filled in automatically.
            Wrong password -> error message; 5 wrong tries ->
            the form is locked for 30 seconds.
   ========================================================== */
(function () {
  const form = document.getElementById('loginForm');
  const user = document.getElementById('username');
  const pass = document.getElementById('password');
  const btn = document.getElementById('btnLogin');
  const errorBox = document.getElementById('loginError');

  /* theme button shows the right icon */
  document.querySelectorAll('.kk-theme-btn i').forEach(i => { i.className = 'bi ' + (KK.theme() === 'dark' ? 'bi-sun' : 'bi-moon-stars'); });

  const showError = html => { errorBox.innerHTML = html; errorBox.classList.remove('d-none'); };

  /* Auto-fill the admin username and password, so the admin only needs to press "Sign in".
     Uses the current password (also after it is changed in Account settings). */
  user.value = KK.admin().username;
  pass.value = KK.admin().password;
  btn.focus();

  /* Show / hide password */
  document.getElementById('togglePw').addEventListener('click', function () {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    this.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
    this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  /* Caps Lock warning */
  pass.addEventListener('keyup', e => {
    document.getElementById('capsWarn').classList.toggle('d-none', !(e.getModifierState && e.getModifierState('CapsLock')));
  });

  /* Forgot password -> popup with help */
  document.getElementById('forgot').addEventListener('click', e => {
    e.preventDefault();
    KK.modal({
      title: 'Forgot password',
      size: 'sm',
      body: '<p class="small mb-0">This system has one admin account and no email service. Please contact the system owner to reset the password.</p>',
      footer: '<button class="btn btn-primary" data-bs-dismiss="modal">OK</button>'
    });
  });

  /* Lock countdown (after 5 wrong passwords) */
  let timer = null;
  function checkLock() {
    const sec = KK.lockedFor();
    if (sec > 0) {
      btn.disabled = true;
      btn.innerHTML = `<i class="bi bi-lock me-1"></i>Locked - try again in ${sec}s`;
      showError(`<i class="bi bi-shield-exclamation me-1"></i>Too many wrong attempts. Please wait ${sec} seconds.`);
      if (!timer) timer = setInterval(checkLock, 1000);
    } else {
      if (timer) { clearInterval(timer); timer = null; errorBox.classList.add('d-none'); }
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }
  checkLock();

  form.addEventListener('submit', e => {
    e.preventDefault();
    errorBox.classList.add('d-none');
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const result = KK.login(user.value, pass.value, document.getElementById('remember').checked);
    if (result.locked) { checkLock(); return; }
    if (result.error) {
      pass.value = '';
      form.classList.remove('was-validated');
      if (KK.lockedFor() > 0) { checkLock(); return; }
      showError(`<i class="bi bi-exclamation-circle me-1"></i>Wrong username or password. ${result.left} attempt(s) left before a 30-second lock.`);
      pass.focus();
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
  });
})();
