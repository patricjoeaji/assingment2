(() => {
  const navHost = document.querySelector(
    '.navigation-6, .navigation-4, .navigation-5, .navigation-2, .navigation-3, .navigation'
  );
  if (!navHost) return;
  const originalRect = navHost.getBoundingClientRect();

  let currentUser = null;
  try {
    currentUser = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
  } catch (error) {
    currentUser = null;
  }

  const isWorker = currentUser?.role === 'Worker';
  const workerGroupIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20"/><path d="M16 5.4a3 3 0 0 1 0 5.2M18 14.7a4 4 0 0 1 2.5 3.8V20"/></svg>';
  const profileIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c.2-4 2.5-6 7-6s6.8 2 7 6"/></svg>';
  const items = isWorker
    ? [
        { key: 'calendar', label: 'Calendar', icon: '▣', href: '/worker-view/worker-view.html' },
        { key: 'jobs', label: 'Jobs', icon: '▤', href: '/worker-view/worker-view.html#jobs' },
        { key: 'payslip', label: 'Pay Slip', icon: '$', href: '/payroll/worker-payslip.html' },
        { key: 'profile', label: 'My Profile', icon: profileIcon, href: '/my-account/my-account.html' }
      ]
    : [
        { key: 'calendar', label: 'Calendar', icon: '▣', href: '/owner-view/owner-view.html' },
        { key: 'timesheets', label: 'Timesheets', icon: '◷', href: '/time-sheet/timesheets.html' },
        { key: 'payroll', label: 'Payroll', icon: '$', href: '/payroll/payroll.html' },
        { key: 'workers', label: 'Workers', icon: workerGroupIcon, href: '/workers/workers.html' },
        { key: 'profile', label: 'My Profile', icon: profileIcon, href: '/my-account/my-account.html' }
      ];

  function getActiveKey() {
    const pathname = window.location.pathname;
    if (isWorker && (window.location.hash === '#jobs' || window.location.hash === '#jobList')) return 'jobs';
    if (pathname.endsWith('/worker-payslip.html')) return 'payslip';
    if (pathname.endsWith('/my-account.html')) return 'profile';
    if (pathname.endsWith('/timesheets.html')) return 'timesheets';
    if (pathname.endsWith('/payroll.html')) return 'payroll';
    if (pathname.endsWith('/workers.html') || pathname.endsWith('/add-worker.html')) return 'workers';
    return 'calendar';
  }

  const navigation = document.createElement('nav');
  navigation.className = 'app-bottom-nav';
  navigation.setAttribute('aria-label', 'Main navigation');
  navigation.style.setProperty('--nav-items', String(items.length));
  navigation.style.setProperty('--nav-left', `${Math.round(originalRect.left)}px`);
  navigation.style.setProperty('--nav-bottom', `${Math.max(0, Math.round(window.innerHeight - originalRect.bottom))}px`);
  navigation.style.setProperty('--nav-width', `${Math.round(Math.min(originalRect.width || 393, window.innerWidth))}px`);
  navigation.innerHTML = items.map(item => `
    <a class="app-bottom-nav-item" data-nav-key="${item.key}"
      href="${item.href}">
      <span class="app-bottom-nav-icon" aria-hidden="true">${item.icon}</span>
      <span class="app-bottom-nav-label">${item.label}</span>
    </a>
  `).join('');

  function updateActiveNavigation() {
    const activeKey = getActiveKey();
    navigation.querySelectorAll('[data-nav-key]').forEach(item => {
      const isActive = item.dataset.navKey === activeKey;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

 const appFrame = navHost.closest(
  '.owner-view, .worker-view > .div, .owner-view-empty .frame'
);

navHost.replaceWith(navigation);

if (appFrame) {
  appFrame.appendChild(navigation);
}
  updateActiveNavigation();
  window.addEventListener('hashchange', updateActiveNavigation);
  window.addEventListener('popstate', updateActiveNavigation);
})();
