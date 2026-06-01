const API_BASE = 'https://deee.pythonanywhere.com/api';

// State variables
let token = localStorage.getItem('access_token') || null;
let refreshToken = localStorage.getItem('refresh_token') || null;
let currentUser = null;
let currentHome = null;
let expenses = [];
let members = [];
let chart = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toRegisterLink = document.getElementById('to-register');
const toLoginLink = document.getElementById('to-login');
const regRoleSelect = document.getElementById('reg-role');
const homeSelectGroup = document.getElementById('home-select-group');
const copyHomeIdBtn = document.getElementById('copy-home-id');

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

// App Initiation
async function initApp() {
    if (token) {
        try {
            await fetchUserProfile();
            showDashboard();
        } catch (error) {
            console.error("Token invalid, logging out...", error);
            logout();
        }
    } else {
        showAuth();
    }
}

// Navigation & Auth view triggers
function showAuth() {
    authScreen.style.display = 'flex';
    dashboardScreen.style.display = 'none';
}

function showDashboard() {
    authScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';
    loadDashboardData();
}

// Event Listeners setup
function setupEventListeners() {
    // Auth Toggle
    toRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    });
    
    toLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
    });

    regRoleSelect.addEventListener('change', () => {
        if (regRoleSelect.value === 'member') {
            homeSelectGroup.style.display = 'block';
            document.getElementById('reg-home-id').setAttribute('required', 'true');
        } else {
            homeSelectGroup.style.display = 'none';
            document.getElementById('reg-home-id').removeAttribute('required');
        }
    });

    // Forms submit
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    document.querySelectorAll('.btn-logout').forEach(btn => btn.addEventListener('click', logout));

    // Sidebar tab clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Copy home ID
    copyHomeIdBtn.addEventListener('click', () => {
        if (currentHome && currentHome.id) {
            navigator.clipboard.writeText(currentHome.id);
            showToast('Home ID copied to clipboard!');
        }
    });

    // Expenses management
    document.getElementById('btn-add-expense').addEventListener('click', () => openExpenseModal());
    document.getElementById('btn-close-modal').addEventListener('click', closeExpenseModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeExpenseModal);
    document.getElementById('expense-form').addEventListener('submit', handleSaveExpense);

    // Filters
    document.getElementById('expense-search').addEventListener('input', renderExpensesTable);
    document.getElementById('expense-type-filter').addEventListener('change', renderExpensesTable);
    document.getElementById('view-all-transactions').addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('tab-expenses');
    });

    // Invite member
    document.getElementById('add-member-form').addEventListener('submit', handleAddMember);
}

// Switching Tabs Helper
function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
    });

    const activeTab = document.getElementById(tabId);
    if (activeTab) activeTab.classList.add('active');
    
    const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (activeNav) activeNav.classList.add('active');
}

// API Requests wrapper
async function apiRequest(endpoint, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (!(options.body instanceof FormData) && typeof options.body === 'object') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    let response = await fetch(`${API_BASE}${endpoint}`, options);

    if (response.status === 401 && refreshToken) {
        // Attempt token refresh
        try {
            const refreshRes = await fetch(`${API_BASE}/accounts/token/refresh/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh: refreshToken })
            });
            if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                token = refreshData.access;
                localStorage.setItem('access_token', token);
                
                // Retry initial request
                options.headers['Authorization'] = `Bearer ${token}`;
                response = await fetch(`${API_BASE}${endpoint}`, options);
            } else {
                logout();
                throw new Error("Session expired. Please log in again.");
            }
        } catch (e) {
            logout();
            throw e;
        }
    }

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || response.statusText || 'API Error');
    }

    return response.status === 204 ? null : response.json();
}

// Authentication Logic
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const data = await apiRequest('/accounts/token/', {
            method: 'POST',
            body: { email, password }
        });

        token = data.access;
        refreshToken = data.refresh;
        localStorage.setItem('access_token', token);
        localStorage.setItem('refresh_token', refreshToken);

        await fetchUserProfile();
        showToast('Login successful!');
        showDashboard();
        loginForm.reset();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;
    const homeId = document.getElementById('reg-home-id').value;

    const payload = { name, email, password, role };
    if (role === 'member' && homeId) {
        payload.home = parseInt(homeId);
    }

    try {
        await apiRequest('/accounts/users/', {
            method: 'POST',
            body: payload
        });

        showToast('Registration successful! Please log in.');
        registerForm.reset();
        toLoginLink.click();
    } catch (error) {
        showToast(error.message, true);
    }
}

function logout() {
    token = null;
    refreshToken = null;
    currentUser = null;
    currentHome = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    showAuth();
}

// Fetch Profile information
async function fetchUserProfile() {
    currentUser = await apiRequest('/accounts/users/me/');
    document.getElementById('user-display-name').innerText = currentUser.name || currentUser.email;
    document.getElementById('user-display-role').innerText = currentUser.role;

    if (currentUser.home) {
        currentHome = await apiRequest('/accounts/homes/current/');
        document.getElementById('home-display-name').innerText = currentHome.name;
        document.getElementById('display-home-id').innerText = `#${currentHome.id}`;
        
        // Only owners can add members
        const navFamilyLink = document.getElementById('nav-family-link');
        if (currentUser.role === 'owner') {
            navFamilyLink.style.display = 'flex';
        } else {
            navFamilyLink.style.display = 'none';
        }
    } else {
        document.getElementById('home-display-name').innerText = 'No Home Associated';
        document.getElementById('display-home-id').innerText = '#--';
    }
}

// Dashboard Data Loading
async function loadDashboardData() {
    try {
        const stats = await apiRequest('/expenses/summary/');
        renderStats(stats);

        expenses = await apiRequest('/expenses/');
        renderRecentTransactions();
        renderExpensesTable();

        if (currentUser.role === 'owner') {
            members = await apiRequest('/accounts/users/');
            renderFamilyMembers();
        }

        updateChart(stats);
    } catch (error) {
        showToast(error.message, true);
    }
}

// UI Rendering - Stats
function renderStats(stats) {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    document.getElementById('stat-balance').innerText = formatter.format(stats.net_balance);
    document.getElementById('stat-credit').innerText = formatter.format(stats.total_credit);
    document.getElementById('stat-debit').innerText = formatter.format(stats.total_debit);
}

// UI Rendering - Recent logs on Overview
function renderRecentTransactions() {
    const list = document.getElementById('recent-transactions-list');
    list.innerHTML = '';

    const recent = expenses.slice(0, 5);
    if (recent.length === 0) {
        list.innerHTML = '<div class="empty-state">No transactions recorded yet.</div>';
        return;
    }

    recent.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'log-item';
        
        const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        const dateStr = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        const isCredit = exp.type === 'credit';
        const typeIcon = isCredit ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
        const typeClass = isCredit ? 'credit' : 'debit';
        const sign = isCredit ? '+' : '-';

        item.innerHTML = `
            <div class="log-icon ${typeClass}">
                <i class="fa-solid ${typeIcon}"></i>
            </div>
            <div class="log-details">
                <div class="log-desc">${exp.description}</div>
                <div class="log-meta">by ${exp.user_name || 'Member'} • ${dateStr}</div>
            </div>
            <div class="log-amount ${typeClass}">${sign}${formatter.format(exp.amount)}</div>
        `;
        list.appendChild(item);
    });
}

// UI Rendering - Transaction table
function renderExpensesTable() {
    const list = document.getElementById('expenses-mobile-list');
    if (!list) return;
    list.innerHTML = '';

    const searchQuery = document.getElementById('expense-search').value.toLowerCase();
    const typeFilter = document.getElementById('expense-type-filter').value;

    const filtered = expenses.filter(exp => {
        const matchesSearch = exp.description.toLowerCase().includes(searchQuery);
        const matchesType = typeFilter === 'all' || exp.type === typeFilter;
        return matchesSearch && matchesType;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">No transactions found.</div>';
        return;
    }

    filtered.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'transaction-card';
        const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        const dateStr = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const isCredit = exp.type === 'credit';
        const sign = isCredit ? '+' : '-';
        const iconClass = isCredit ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
        const typeClass = isCredit ? 'credit' : 'debit';

        item.innerHTML = `
            <div class="t-icon ${typeClass}">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="t-details">
                <div class="t-desc">${exp.description}</div>
                <div class="t-meta">by ${exp.user_name || 'Member'} • ${dateStr}</div>
            </div>
            <div class="t-right">
                <div class="t-amount ${typeClass}">${sign}${formatter.format(exp.amount)}</div>
                <div class="t-actions">
                    <button class="edit" onclick="openExpenseModal(${exp.id})"><i class="fa-regular fa-pen-to-square"></i></button>
                    <button class="delete" onclick="deleteExpense(${exp.id})"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </div>
        `;
        list.appendChild(item);
    });
}


// UI Rendering - Family Members
function renderFamilyMembers() {
    const list = document.getElementById('family-members-list');
    list.innerHTML = '';

    if (members.length === 0) {
        list.innerHTML = '<div class="empty-state">No other family members.</div>';
        return;
    }

    members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'member-row';
        
        item.innerHTML = `
            <div class="member-details">
                <h4 style="font-weight: 600;">${member.name || member.email}</h4>
                <p style="color: var(--text-secondary); font-size: 0.85rem;">${member.email}</p>
            </div>
            <span class="member-badge ${member.role}">${member.role}</span>
        `;
        list.appendChild(item);
    });
}

// Chart.js Updates
function updateChart(stats) {
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    
    if (chart) {
        chart.destroy();
    }

    chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Credits (Income)', 'Debits (Expenses)'],
            datasets: [{
                data: [stats.total_credit, stats.total_debit],
                backgroundColor: ['#10B981', '#EF4444'],
                borderWidth: 1,
                borderColor: '#1e293b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#F3F4F6',
                        font: {
                            family: 'Outfit',
                            size: 13
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

// Modals controller
function openExpenseModal(id = null) {
    const modal = document.getElementById('expense-modal');
    const form = document.getElementById('expense-form');
    const title = document.getElementById('modal-title');
    
    form.reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];

    if (id) {
        title.innerText = 'Edit Transaction';
        const exp = expenses.find(e => e.id === id);
        if (exp) {
            document.getElementById('expense-id').value = exp.id;
            document.getElementById('expense-amount').value = exp.amount;
            document.getElementById('expense-description').value = exp.description;
            document.getElementById('expense-date').value = exp.date;
            
            document.querySelector(`input[name="expense-type"][value="${exp.type}"]`).checked = true;
        }
    } else {
        title.innerText = 'Record Transaction';
        document.getElementById('expense-id').value = '';
    }

    modal.classList.add('active');
}

function closeExpenseModal() {
    document.getElementById('expense-modal').classList.remove('active');
}

// CRUD Operations - Expenses
async function handleSaveExpense(e) {
    e.preventDefault();
    const id = document.getElementById('expense-id').value;
    const amount = document.getElementById('expense-amount').value;
    const type = document.querySelector('input[name="expense-type"]:checked').value;
    const description = document.getElementById('expense-description').value;
    const date = document.getElementById('expense-date').value;

    const payload = { amount, type, description, date };
    const method = id ? 'PUT' : 'POST';
    const endpoint = id ? `/expenses/${id}/` : '/expenses/';

    try {
        await apiRequest(endpoint, {
            method: method,
            body: payload
        });
        showToast('Transaction saved successfully!');
        closeExpenseModal();
        loadDashboardData();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this record?')) return;
    
    try {
        await apiRequest(`/expenses/${id}/`, {
            method: 'DELETE'
        });
        showToast('Transaction deleted!');
        loadDashboardData();
    } catch (error) {
        showToast(error.message, true);
    }
}

// Invitation logic
async function handleAddMember(e) {
    e.preventDefault();
    const name = document.getElementById('member-name').value;
    const email = document.getElementById('member-email').value;
    const password = document.getElementById('member-password').value;
    const role = document.getElementById('member-role').value;

    try {
        await apiRequest('/accounts/users/', {
            method: 'POST',
            body: { name, email, password, role, home: currentHome.id }
        });
        showToast('Family member invited successfully!');
        document.getElementById('add-member-form').reset();
        loadDashboardData();
    } catch (error) {
        showToast(error.message, true);
    }
}

// Notification Toast helper
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.style.borderColor = isError ? 'var(--debit-color)' : 'var(--accent-color)';
    toast.style.boxShadow = isError ? '0 10px 25px rgba(239, 68, 68, 0.3)' : '0 10px 25px rgba(99, 102, 241, 0.3)';
    document.getElementById('toast-message').innerText = message;
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Export functions to global window object for onclick events
window.openExpenseModal = openExpenseModal;
window.deleteExpense = deleteExpense;
