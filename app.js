const API_BASE = 'https://deee.pythonanywhere.com/api';
// const API_BASE = 'http://localhost:8000/api';

// State variables
let token = localStorage.getItem('access_token') || null;
let refreshToken = localStorage.getItem('refresh_token') || null;
let currentUser = null;
let currentHome = null;
let expenses = [];
let members = [];
let categoryChart = null;
let monthlyChart = null;
let activePendingDeleteId = null;

// Category icons mapping
const CATEGORY_ICONS = {
    groceries: 'fa-basket-shopping',
    food: 'fa-utensils',
    utilities: 'fa-bolt',
    housing: 'fa-house',
    transport: 'fa-car',
    shopping: 'fa-bag-shopping',
    clothing: 'fa-shirt',
    healthcare: 'fa-heart-pulse',
    education: 'fa-book',
    personal: 'fa-wand-magic-sparkles',
    household: 'fa-broom',
    entertainment: 'fa-film',
    gifts: 'fa-gift',
    travel: 'fa-plane',
    repairs: 'fa-wrench',
    bills: 'fa-file-invoice-dollar',
    other: 'fa-box'
};

// Reusable Currency Formatting Utility for Indian Rupees (INR)
function formatINR(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
    const num = Number(amount);
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    
    // Format Indian Numbering System
    const formatted = new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0
    }).format(absVal);

    return `${isNegative ? '-' : ''}₹${formatted}`;
}

// DOM Elements
const splashScreen = document.getElementById('splash-screen');
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
    registerServiceWorker();
});

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered successfully:', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }
}

// App Initiation
async function initApp() {
    if (token) {
        try {
            await fetchUserProfile();
            showDashboard();
        } catch (error) {
            console.error("Token invalid, logging out...", error);
            logout();
        } finally {
            hideSplash();
        }
    } else {
        showAuth();
        hideSplash();
    }
}

function hideSplash() {
    if (splashScreen) {
        splashScreen.style.display = 'none';
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

    // Tab navigation
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

    // Period selector dropdown change
    document.getElementById('overview-period-select').addEventListener('change', () => {
        loadDashboardData();
    });

    // Expenses management
    document.getElementById('btn-add-expense').addEventListener('click', () => openExpenseModal());
    document.getElementById('btn-close-modal').addEventListener('click', closeExpenseModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeExpenseModal);
    document.getElementById('expense-form').addEventListener('submit', handleSaveExpense);

    // Ledger Filters
    document.getElementById('expense-search').addEventListener('input', fetchFilteredExpenses);
    document.getElementById('expense-type-filter').addEventListener('change', fetchFilteredExpenses);
    document.getElementById('expense-category-filter').addEventListener('change', fetchFilteredExpenses);
    document.getElementById('expense-member-filter').addEventListener('change', fetchFilteredExpenses);
    document.getElementById('expense-start-date').addEventListener('change', fetchFilteredExpenses);
    document.getElementById('expense-end-date').addEventListener('change', fetchFilteredExpenses);

    document.getElementById('view-all-transactions').addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('tab-expenses');
    });

    // Invite member
    document.getElementById('add-member-form').addEventListener('submit', handleAddMember);

    // View Modal Actions
    document.getElementById('btn-close-view-modal').addEventListener('click', closeViewModal);
    document.getElementById('btn-close-view-action').addEventListener('click', closeViewModal);
    document.getElementById('btn-edit-expense-action').addEventListener('click', () => {
        const expId = parseInt(document.getElementById('btn-edit-expense-action').getAttribute('data-id'));
        closeViewModal();
        openExpenseModal(expId);
    });
    document.getElementById('btn-delete-expense-action').addEventListener('click', () => {
        const expId = parseInt(document.getElementById('btn-delete-expense-action').getAttribute('data-id'));
        closeViewModal();
        confirmDeleteExpense(expId);
    });

    // Confirm Delete Modal Actions
    document.getElementById('btn-close-delete-modal').addEventListener('click', closeDeleteModal);
    document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
    document.getElementById('btn-confirm-delete').addEventListener('click', executeDeleteExpense);
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

    let response;
    try {
        response = await fetch(`${API_BASE}${endpoint}`, options);
    } catch (networkErr) {
        throw new Error("Network error. Please check your internet connection.");
    }

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
        let message = errData.detail || errData.error || response.statusText || 'API Error';
        if (typeof errData === 'object' && !errData.detail && !errData.error) {
            // Handle field validation errors like { amount: ["..."] }
            const keys = Object.keys(errData);
            if (keys.length > 0) {
                const firstKey = keys[0];
                const val = errData[firstKey];
                message = Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
            }
        }
        throw new Error(message);
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
    const userPromise = apiRequest('/accounts/users/me/');
    const homePromise = apiRequest('/accounts/homes/current/').catch(err => {
        console.warn("Failed to fetch home or no home associated", err);
        return null;
    });

    const [user, home] = await Promise.all([userPromise, homePromise]);
    currentUser = user;
    currentHome = home;

    document.getElementById('user-display-name').innerText = currentUser.name || currentUser.email;
    document.getElementById('user-display-role').innerText = currentUser.role;

    if (currentUser.home && currentHome) {
        document.getElementById('home-display-name').innerText = currentHome.name;
        document.getElementById('display-home-id').innerText = `#${currentHome.id}`;
        
        const navFamilyLink = document.getElementById('nav-family-link');
        navFamilyLink.style.display = 'flex';
    } else {
        document.getElementById('home-display-name').innerText = 'No Home Associated';
        document.getElementById('display-home-id').innerText = '#--';
    }
}

// Helper to compute date range from selected period
function getPeriodDateRange() {
    const period = document.getElementById('overview-period-select').value;
    const now = new Date();
    let start_date = null;
    let end_date = null;

    if (period === 'this_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start_date = start.toISOString().split('T')[0];
    } else if (period === 'last_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        start_date = start.toISOString().split('T')[0];
        end_date = end.toISOString().split('T')[0];
    } else if (period === 'this_week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        const start = new Date(now.setDate(diff));
        start_date = start.toISOString().split('T')[0];
    } else if (period === 'this_year') {
        const start = new Date(now.getFullYear(), 0, 1);
        start_date = start.toISOString().split('T')[0];
    }

    return { start_date, end_date };
}

// Dashboard Data Loading (Uses Backend Analytics Endpoints)
async function loadDashboardData() {
    setLoadingState(true);
    try {
        const { start_date, end_date } = getPeriodDateRange();
        let queryParams = '';
        const params = [];
        if (start_date) params.push(`start_date=${start_date}`);
        if (end_date) params.push(`end_date=${end_date}`);
        if (params.length > 0) queryParams = '?' + params.join('&');

        const [summary, categorySummary, monthlySummary, memberSummary, expenseList] = await Promise.all([
            apiRequest(`/expenses/summary/${queryParams}`),
            apiRequest(`/expenses/category-summary/${queryParams}`),
            apiRequest('/expenses/monthly-summary/'),
            apiRequest('/expenses/member-summary/'),
            apiRequest(`/expenses/${queryParams}`)
        ]);

        expenses = expenseList;
        renderSummaryCard(summary);
        renderPeriodBreakdownCard(summary);
        renderCategoryDonutChart(categorySummary.categories);
        renderMonthlyBarChart(monthlySummary.months);
        renderTopCategoriesList(categorySummary.categories);
        renderInsights(summary, categorySummary.categories);
        renderRecentTransactions();
        renderExpensesLedger(expenses);
        
        // Populate member dropdown for filters and render family tab
        populateMemberFilter(memberSummary.members);
        renderFamilyMembers(memberSummary.members);

    } catch (error) {
        showToast(error.message, true);
    } finally {
        setLoadingState(false);
    }
}

// Skeleton loading toggler
function setLoadingState(isLoading) {
    const list = document.getElementById('recent-transactions-list');
    if (isLoading && list) {
        list.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
    }
}

// Render Summary Balance Card
function renderSummaryCard(summary) {
    document.getElementById('stat-balance').innerText = formatINR(summary.net_balance);
    document.getElementById('stat-credit').innerText = formatINR(summary.total_credit);
    document.getElementById('stat-debit').innerText = formatINR(summary.total_debit);
}

// Render Period Summary Breakdown
function renderPeriodBreakdownCard(summary) {
    const periodSelect = document.getElementById('overview-period-select');
    const periodLabel = periodSelect.options[periodSelect.selectedIndex].text;
    document.getElementById('period-summary-title').innerText = periodLabel;

    document.getElementById('p-stat-spent').innerText = formatINR(summary.total_debit);
    document.getElementById('p-stat-received').innerText = formatINR(summary.total_credit);
    document.getElementById('p-stat-count').innerText = summary.transaction_count || 0;

    const avg = summary.transaction_count > 0 ? (summary.total_debit / summary.transaction_count) : 0;
    document.getElementById('p-stat-avg').innerText = formatINR(avg);
}

// Render Category Donut Chart
function renderCategoryDonutChart(categories) {
    const ctx = document.getElementById('category-donut-chart').getContext('2d');
    if (categoryChart) categoryChart.destroy();

    if (!categories || categories.length === 0) {
        categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No spending data'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(255,255,255,0.1)']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        return;
    }

    const labels = categories.map(c => c.label);
    const data = categories.map(c => c.amount);
    const colors = [
        '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#EC4899', 
        '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4', '#3B82F6'
    ];

    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, categories.length),
                borderWidth: 1,
                borderColor: '#0B0E14'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#F3F4F6', font: { family: 'Outfit', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const cat = categories[context.dataIndex];
                            return ` ${cat.label}: ${formatINR(cat.amount)} (${cat.percentage}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

// Render Monthly Bar Chart
function renderMonthlyBarChart(months) {
    const ctx = document.getElementById('monthly-bar-chart').getContext('2d');
    if (monthlyChart) monthlyChart.destroy();

    if (!months || months.length === 0) {
        return;
    }

    const labels = months.map(m => {
        if (!m.month) return 'Unknown';
        const [year, month] = m.month.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleString('en-US', { month: 'short' });
    });
    const debits = months.map(m => m.debit);
    const credits = months.map(m => m.credit);

    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Spent (Debits)',
                    data: debits,
                    backgroundColor: '#EF4444',
                    borderRadius: 4
                },
                {
                    label: 'Received (Credits)',
                    data: credits,
                    backgroundColor: '#10B981',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#F3F4F6', font: { family: 'Outfit', size: 11 } }
                }
            },
            scales: {
                x: { ticks: { color: '#9CA3AF' }, grid: { display: false } },
                y: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

// Render Top Spending Categories
function renderTopCategoriesList(categories) {
    const container = document.getElementById('top-categories-list');
    container.innerHTML = '';

    if (!categories || categories.length === 0) {
        container.innerHTML = '<div class="empty-state">No spending data for this period.</div>';
        return;
    }

    const topList = categories.slice(0, 4);
    topList.forEach(item => {
        const icon = CATEGORY_ICONS[item.category] || 'fa-box';
        const row = document.createElement('div');
        row.className = 'top-cat-item';

        row.innerHTML = `
            <div class="top-cat-info">
                <div class="top-cat-left">
                    <i class="fa-solid ${icon}"></i>
                    <span>${item.label}</span>
                </div>
                <div class="top-cat-right">
                    <span class="top-cat-amount">${formatINR(item.amount)}</span>
                    <span class="top-cat-pct">${item.percentage}%</span>
                </div>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${Math.min(item.percentage, 100)}%;"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

// Render Financial Insights based strictly on data
function renderInsights(summary, categories) {
    const container = document.getElementById('insights-list');
    container.innerHTML = '';
    const insights = [];

    if (categories && categories.length > 0) {
        const topCat = categories[0];
        insights.push(`💡 <strong>${topCat.label}</strong> is your largest spending category for this period (${formatINR(topCat.amount)}, ${topCat.percentage}%).`);
    }

    if (summary.transaction_count > 0) {
        const avg = summary.total_debit / summary.transaction_count;
        insights.push(`💡 Your average transaction amount is <strong>${formatINR(avg)}</strong>.`);
    }

    if (categories && categories.length > 1) {
        const secondCat = categories[1];
        insights.push(`💡 <strong>${secondCat.label}</strong> accounts for <strong>${formatINR(secondCat.amount)}</strong> (${secondCat.percentage}%) of expenses.`);
    }

    if (insights.length === 0) {
        container.innerHTML = '<div class="empty-state">Record more transactions to unlock family insights!</div>';
        return;
    }

    insights.forEach(text => {
        const item = document.createElement('div');
        item.className = 'insight-item';
        item.innerHTML = text;
        container.appendChild(item);
    });
}

// UI Rendering - Recent logs on Overview
function renderRecentTransactions() {
    const list = document.getElementById('recent-transactions-list');
    list.innerHTML = '';

    const recent = expenses.slice(0, 5);
    if (recent.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <p>No transactions yet</p>
            <small>Start tracking your family finances by recording your first transaction.</small>
        </div>`;
        return;
    }

    recent.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.setAttribute('onclick', `openViewModal(${exp.id})`);
        item.style.cursor = 'pointer';
        
        const dateStr = new Date(exp.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        const isCredit = exp.type === 'credit';
        const catIcon = CATEGORY_ICONS[exp.category] || 'fa-arrow-trend-down';
        const typeIcon = isCredit ? 'fa-arrow-trend-up' : catIcon;
        const typeClass = isCredit ? 'credit' : 'debit';
        const sign = isCredit ? '+' : '-';

        item.innerHTML = `
            <div class="log-icon ${typeClass}">
                <i class="fa-solid ${typeIcon}"></i>
            </div>
            <div class="log-details">
                <div class="log-desc" title="${exp.description}">${exp.description}</div>
                <div class="log-meta">${exp.category_display || 'Category'} • ${exp.user_name || 'Member'} • ${dateStr}</div>
            </div>
            <div class="log-amount ${typeClass}">${sign}${formatINR(exp.amount)}</div>
        `;
        list.appendChild(item);
    });
}

let currentLedgerExpensesMap = new Map();

// Fetch Filtered Expenses for Ledger
async function fetchFilteredExpenses() {
    const search = document.getElementById('expense-search').value;
    const type = document.getElementById('expense-type-filter').value;
    const category = document.getElementById('expense-category-filter').value;
    const user = document.getElementById('expense-member-filter').value;
    const start_date = document.getElementById('expense-start-date').value;
    const end_date = document.getElementById('expense-end-date').value;

    const params = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (type && type !== 'all') params.push(`type=${type}`);
    if (category && category !== 'all') params.push(`category=${category}`);
    if (user && user !== 'all') params.push(`user=${user}`);
    if (start_date) params.push(`start_date=${start_date}`);
    if (end_date) params.push(`end_date=${end_date}`);

    const queryStr = params.length > 0 ? '?' + params.join('&') : '';
    try {
        const filteredList = await apiRequest(`/expenses/${queryStr}`);
        currentLedgerExpensesMap.clear();
        if (Array.isArray(filteredList)) {
            filteredList.forEach(item => currentLedgerExpensesMap.set(item.id, item));
        }
        renderExpensesLedger(filteredList);
    } catch (error) {
        showToast(error.message, true);
    }
}

// Render Date-Grouped Ledger on History Screen
function renderExpensesLedger(listData) {
    const listContainer = document.getElementById('expenses-mobile-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!listData || listData.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">
            <p>No transactions found matching filters.</p>
        </div>`;
        return;
    }

    // Group expenses by Date
    const grouped = {};
    listData.forEach(exp => {
        const d = exp.date;
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(exp);
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)).forEach(dateKey => {
        let labelDate = new Date(dateKey).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
        if (dateKey === todayStr) labelDate = 'TODAY';
        else if (dateKey === yesterdayStr) labelDate = 'YESTERDAY';

        const header = document.createElement('div');
        header.className = 'date-group-header';
        header.innerText = labelDate;
        listContainer.appendChild(header);

        grouped[dateKey].forEach(exp => {
            const item = document.createElement('div');
            item.className = 'log-item';
            item.setAttribute('data-id', exp.id);
            item.style.cursor = 'pointer';
            item.style.marginBottom = '8px';

            const isCredit = exp.type === 'credit';
            const icon = isCredit ? 'fa-arrow-trend-up' : (CATEGORY_ICONS[exp.category] || 'fa-tag');
            const typeClass = isCredit ? 'credit' : 'debit';
            const sign = isCredit ? '+' : '-';

            item.innerHTML = `
                <div class="log-icon ${typeClass}">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="log-details">
                    <div class="log-desc" title="${exp.description}">${exp.description}</div>
                    <div class="log-meta">${exp.category_display || 'Category'} • ${exp.user_name || 'Member'}</div>
                </div>
                <div class="log-amount ${typeClass}">${sign}${formatINR(exp.amount)}</div>
            `;
            
            const handleItemClick = (e) => {
                e.preventDefault();
                openViewModal(exp.id);
            };
            item.addEventListener('click', handleItemClick);
            item.addEventListener('touchend', (e) => {
                e.preventDefault();
                openViewModal(exp.id);
            });

            listContainer.appendChild(item);
        });

    });
}

// Populate Member filter dropdown
function populateMemberFilter(memberList) {
    const select = document.getElementById('expense-member-filter');
    const currentVal = select.value;
    select.innerHTML = '<option value="all">All Members</option>';
    memberList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.user_id;
        opt.innerText = m.name;
        select.appendChild(opt);
    });
    select.value = currentVal || 'all';
}

// UI Rendering - Family Members Summary
function renderFamilyMembers(memberList) {
    const container = document.getElementById('family-members-list');
    container.innerHTML = '';

    if (!memberList || memberList.length === 0) {
        container.innerHTML = '<div class="empty-state">No family members found.</div>';
        return;
    }

    memberList.forEach(member => {
        const card = document.createElement('div');
        card.className = 'member-row';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        card.style.gap = '8px';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h4>${member.name}</h4>
                <span class="badge" style="background: rgba(99,102,241,0.15); color: #818CF8;">${member.transaction_count} txns</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--text-secondary);">
                <span>Spent: <strong class="debit-val" style="color: var(--debit-color);">${formatINR(member.total_debit)}</strong></span>
                <span>Received: <strong class="credit-val" style="color: var(--credit-color);">${formatINR(member.total_credit)}</strong></span>
            </div>
        `;
        container.appendChild(card);
    });
}

// Add/Edit Modal controller
function openExpenseModal(id = null) {
    const modal = document.getElementById('expense-modal');
    const form = document.getElementById('expense-form');
    const title = document.getElementById('modal-title');
    
    form.reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];

    if (id) {
        title.innerText = 'Edit Transaction';
        const exp = expenses.find(e => e.id === id) || currentLedgerExpensesMap.get(id);
        if (exp) {
            document.getElementById('expense-id').value = exp.id;
            document.getElementById('expense-amount').value = exp.amount;
            document.getElementById('expense-category').value = exp.category;
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

// View-Only Modal controller
function openViewModal(id) {
    const exp = expenses.find(e => e.id === id) || currentLedgerExpensesMap.get(id);
    if (!exp) return;


    const dateStr = new Date(exp.date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' });

    document.getElementById('view-expense-amount').innerText = formatINR(exp.amount);
    
    const typeEl = document.getElementById('view-expense-type');
    typeEl.innerText = exp.type === 'credit' ? 'Credit (Income)' : 'Debit (Expense)';
    typeEl.style.color = exp.type === 'credit' ? 'var(--credit-color)' : 'var(--debit-color)';

    document.getElementById('view-expense-category').innerText = exp.category_display || exp.category;
    document.getElementById('view-expense-description').innerText = exp.description;
    document.getElementById('view-expense-date').innerText = dateStr;
    document.getElementById('view-expense-user').innerText = exp.user_name || 'Member';

    document.getElementById('btn-edit-expense-action').setAttribute('data-id', exp.id);
    document.getElementById('btn-delete-expense-action').setAttribute('data-id', exp.id);

    document.getElementById('view-expense-modal').classList.add('active');
}

function closeViewModal() {
    document.getElementById('view-expense-modal').classList.remove('active');
}

// Delete confirmation modal flow (Non-accidental deletion)
function confirmDeleteExpense(id) {
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;

    activePendingDeleteId = id;
    document.getElementById('delete-summary-text').innerText = `${formatINR(exp.amount)} — ${exp.category_display || exp.category}`;
    document.getElementById('delete-confirm-modal').classList.add('active');
}

function closeDeleteModal() {
    activePendingDeleteId = null;
    document.getElementById('delete-confirm-modal').classList.remove('active');
}

async function executeDeleteExpense() {
    if (!activePendingDeleteId) return;
    try {
        await apiRequest(`/expenses/${activePendingDeleteId}/`, {
            method: 'DELETE'
        });
        showToast('Transaction deleted!');
        closeDeleteModal();
        loadDashboardData();
    } catch (error) {
        showToast(error.message, true);
    }
}

// CRUD Operations - Expenses Save
async function handleSaveExpense(e) {
    e.preventDefault();
    const id = document.getElementById('expense-id').value;
    const amount = document.getElementById('expense-amount').value;
    const type = document.querySelector('input[name="expense-type"]:checked').value;
    const category = document.getElementById('expense-category').value;
    const description = document.getElementById('expense-description').value;
    const date = document.getElementById('expense-date').value;

    if (!category) {
        showToast("Please select a category.", true);
        return;
    }

    const payload = { amount, type, category, description, date };
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

// Export functions to global window object for inline handlers
window.openExpenseModal = openExpenseModal;
window.openViewModal = openViewModal;
window.confirmDeleteExpense = confirmDeleteExpense;
