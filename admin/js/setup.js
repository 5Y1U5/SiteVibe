// ============================================
// SiteVibe Setup — 管理者セットアップ画面 JS
// クライアント・ユーザー CRUD 操作
// ============================================

const PLAN_LIMITS = { light: 3, standard: 10, premium: 30 };
let currentUser = null;
let clientsCache = [];

// ─── 初期化 ───
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('認証失敗');
    currentUser = await res.json();

    if (currentUser.role !== 'admin') {
      document.getElementById('loadingState').hidden = true;
      document.getElementById('errorState').hidden = false;
      return;
    }

    document.getElementById('loadingState').hidden = true;
    document.getElementById('setupContent').hidden = false;

    initTabs();
    initClientModal();
    initUserModal();
    initReminder();

    await loadClients();
    await loadUsers();
  } catch {
    document.getElementById('loadingState').hidden = true;
    document.getElementById('errorState').hidden = false;
  }
});

// ─── タブ切り替え ───
function initTabs() {
  document.querySelectorAll('.setup-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.setup-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.setup-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ─── リマインダー ───
function initReminder() {
  document.getElementById('cfAccessReminderClose').addEventListener('click', () => {
    document.getElementById('cfAccessReminder').hidden = true;
  });
}

function showReminder(email) {
  const el = document.getElementById('cfAccessReminder');
  document.getElementById('cfAccessReminderText').textContent =
    `CF Access ポリシーに ${email} を追加してください`;
  el.hidden = false;
}

// ============================================
// クライアント管理
// ============================================

async function loadClients() {
  const res = await fetch('/api/clients');
  const data = await res.json();
  clientsCache = data.clients || [];
  renderClients();
  updateClientSelects();
}

function renderClients() {
  const tbody = document.getElementById('clientsBody');

  if (clientsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="setup-empty">クライアントはまだ登録されていません</td></tr>';
    return;
  }

  tbody.innerHTML = clientsCache.map(c => `
    <tr>
      <td><code>${esc(c.id)}</code></td>
      <td>${esc(c.name)}</td>
      <td><span class="setup-badge setup-badge--plan">${esc(c.plan)}</span></td>
      <td>${c.monthly_limit}</td>
      <td>${c.stripe_customer_id ? `<code>${esc(c.stripe_customer_id)}</code>` : '<span style="color:var(--admin-text-dim)">—</span>'}</td>
      <td><span class="setup-badge ${c.active ? 'setup-badge--active' : 'setup-badge--inactive'}">${c.active ? '有効' : '無効'}</span></td>
      <td>
        <button class="setup-btn setup-btn--secondary setup-btn--sm" onclick="editClient('${esc(c.id)}')">編集</button>
        ${c.id !== 'default' && c.active ? `<button class="setup-btn setup-btn--danger setup-btn--sm" onclick="deactivateClient('${esc(c.id)}', '${esc(c.name)}')">無効化</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function updateClientSelects() {
  const activeClients = clientsCache.filter(c => c.active);
  const options = activeClients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  // ユーザーフィルター
  const filter = document.getElementById('userClientFilter');
  filter.innerHTML = '<option value="">全クライアント</option>' + options;

  // ユーザーフォーム
  const select = document.getElementById('userClient');
  select.innerHTML = '<option value="">選択してください</option>' + options;
}

// クライアントモーダル
function initClientModal() {
  const modal = document.getElementById('clientModal');
  const form = document.getElementById('clientForm');
  const planSelect = document.getElementById('clientPlan');
  const limitInput = document.getElementById('clientLimit');

  document.getElementById('addClientBtn').addEventListener('click', () => openClientModal('create'));
  document.getElementById('clientModalClose').addEventListener('click', () => modal.hidden = true);
  document.getElementById('clientFormCancel').addEventListener('click', () => modal.hidden = true);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  // プラン → 上限自動設定
  planSelect.addEventListener('change', () => {
    if (document.getElementById('clientFormMode').value === 'create') {
      limitInput.value = PLAN_LIMITS[planSelect.value] || 3;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.getElementById('clientFormMode').value;
    const submitBtn = document.getElementById('clientFormSubmit');
    submitBtn.disabled = true;

    const body = {
      id: document.getElementById('clientId').value.trim(),
      name: document.getElementById('clientName').value.trim(),
      plan: planSelect.value,
      monthly_limit: parseInt(limitInput.value),
      repo_path: document.getElementById('clientRepo').value.trim() || undefined,
      stripe_customer_id: document.getElementById('clientStripe').value.trim() || undefined,
      writing_profile: document.getElementById('clientWritingProfile').value.trim() || undefined,
    };

    try {
      const url = '/api/clients';
      const method = mode === 'create' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'エラーが発生しました');
        return;
      }

      modal.hidden = true;
      await loadClients();
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function openClientModal(mode, clientId) {
  const modal = document.getElementById('clientModal');
  const idInput = document.getElementById('clientId');

  document.getElementById('clientFormMode').value = mode;
  document.getElementById('clientModalTitle').textContent =
    mode === 'create' ? 'クライアントを追加' : 'クライアントを編集';
  document.getElementById('clientFormSubmit').textContent =
    mode === 'create' ? '作成' : '更新';

  if (mode === 'create') {
    document.getElementById('clientForm').reset();
    document.getElementById('clientLimit').value = 3;
    idInput.readOnly = false;
  } else {
    const c = clientsCache.find(c => c.id === clientId);
    if (!c) return;
    idInput.value = c.id;
    idInput.readOnly = true;
    document.getElementById('clientName').value = c.name;
    document.getElementById('clientPlan').value = c.plan;
    document.getElementById('clientLimit').value = c.monthly_limit;
    document.getElementById('clientRepo').value = c.repo_path || '';
    document.getElementById('clientStripe').value = c.stripe_customer_id || '';
    document.getElementById('clientWritingProfile').value = c.writing_profile || '';
  }

  modal.hidden = false;
}

// グローバルに公開（onclick から呼ぶため）
window.editClient = (id) => openClientModal('edit', id);

window.deactivateClient = async (id, name) => {
  if (!confirm(`「${name}」を無効化しますか？\nユーザーはログインできなくなります。`)) return;

  const res = await fetch(`/api/clients?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await res.json();

  if (!res.ok) {
    alert(data.error || 'エラーが発生しました');
    return;
  }

  await loadClients();
};

// ============================================
// ユーザー管理
// ============================================

async function loadUsers(clientId) {
  const params = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
  const res = await fetch(`/api/admin-users${params}`);
  const data = await res.json();
  renderUsers(data.users || []);
}

function renderUsers(users) {
  const tbody = document.getElementById('usersBody');

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="setup-empty">ユーザーはまだ登録されていません</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${esc(u.email)}</td>
      <td>${esc(u.client_name || u.client_id)}</td>
      <td><span class="setup-badge ${u.role === 'admin' ? 'setup-badge--admin' : 'setup-badge--client'}">${u.role}</span></td>
      <td>${u.display_name ? esc(u.display_name) : '<span style="color:var(--admin-text-dim)">—</span>'}</td>
      <td>
        <button class="setup-btn setup-btn--secondary setup-btn--sm" onclick="editUser('${esc(u.email)}', '${esc(u.client_id)}', '${esc(u.role)}', '${esc(u.display_name || '')}')">編集</button>
        <button class="setup-btn setup-btn--danger setup-btn--sm" onclick="deleteUser('${esc(u.email)}')">削除</button>
      </td>
    </tr>
  `).join('');
}

function initUserModal() {
  const modal = document.getElementById('userModal');
  const form = document.getElementById('userForm');

  document.getElementById('addUserBtn').addEventListener('click', () => openUserModal('create'));
  document.getElementById('userModalClose').addEventListener('click', () => modal.hidden = true);
  document.getElementById('userFormCancel').addEventListener('click', () => modal.hidden = true);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  // フィルター
  document.getElementById('userClientFilter').addEventListener('change', (e) => {
    loadUsers(e.target.value || undefined);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.getElementById('userFormMode').value;
    const submitBtn = document.getElementById('userFormSubmit');
    submitBtn.disabled = true;

    const email = document.getElementById('userEmail').value.trim();
    const body = {
      email,
      client_id: document.getElementById('userClient').value,
      role: document.getElementById('userRole').value,
      display_name: document.getElementById('userDisplayName').value.trim() || undefined,
    };

    try {
      const method = mode === 'create' ? 'POST' : 'PUT';
      const res = await fetch('/api/admin-users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'エラーが発生しました');
        return;
      }

      modal.hidden = true;

      if (mode === 'create') {
        showReminder(email);
      }

      const filter = document.getElementById('userClientFilter').value;
      await loadUsers(filter || undefined);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function openUserModal(mode, email, clientId, role, displayName) {
  const modal = document.getElementById('userModal');
  const emailInput = document.getElementById('userEmail');

  document.getElementById('userFormMode').value = mode;
  document.getElementById('userModalTitle').textContent =
    mode === 'create' ? 'ユーザーを追加' : 'ユーザーを編集';
  document.getElementById('userFormSubmit').textContent =
    mode === 'create' ? '作成' : '更新';

  if (mode === 'create') {
    document.getElementById('userForm').reset();
    emailInput.readOnly = false;
  } else {
    emailInput.value = email;
    emailInput.readOnly = true;
    document.getElementById('userClient').value = clientId;
    document.getElementById('userRole').value = role;
    document.getElementById('userDisplayName').value = displayName || '';
  }

  modal.hidden = false;
}

window.editUser = (email, clientId, role, displayName) => {
  openUserModal('edit', email, clientId, role, displayName);
};

window.deleteUser = async (email) => {
  if (!confirm(`「${email}」を削除しますか？`)) return;

  const res = await fetch(`/api/admin-users?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
  const data = await res.json();

  if (!res.ok) {
    alert(data.error || 'エラーが発生しました');
    return;
  }

  const filter = document.getElementById('userClientFilter').value;
  await loadUsers(filter || undefined);
};

// ─── ユーティリティ ───
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
