// ===== AttendX - Attendance Tracker Dashboard =====
// Premium SaaS Dashboard Application - Supabase Integrated

(function () {
    'use strict';

    // ===== Supabase Setup =====
    const SUPABASE_URL = 'https://rfolmksucleopazrunxj.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_fhrQONilkIwgBC6aK2mfyg__fJtBVSF';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let currentUser = null;

    // ===== State Management =====
    let state = {
        courses: [],
        schedule: [],
        weeklyLog: {}
    };

    // ===== Auth Logic =====
    const authOverlay = document.getElementById('authOverlay');
    const mainApp = document.getElementById('mainApp');
    const authError = document.getElementById('authError');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const authSubmit = document.getElementById('authSubmit');
    const authSubmitText = document.getElementById('authSubmitText');
    const authRegisterNote = document.getElementById('authRegisterNote');
    let isLoginMode = true;

    tabLogin.onclick = () => {
        isLoginMode = true;
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        authSubmitText.textContent = 'Giriş Yap';
        authRegisterNote.style.display = 'none';
        authError.style.display = 'none';
    };

    tabRegister.onclick = () => {
        isLoginMode = false;
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmitText.textContent = 'Kayıt Ol';
        authRegisterNote.style.display = 'block';
        authError.style.display = 'none';
    };

    authSubmit.onclick = async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) {
            showAuthError('Lütfen e-posta ve şifre girin.');
            return;
        }

        authSubmit.disabled = true;
        authSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lütfen bekleyin...';

        try {
            if (isLoginMode) {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                if (data.user && !data.session) {
                    showAuthError('Kayıt başarılı. Lütfen e-postanızı doğrulayın.');
                    resetAuthBtn();
                    return;
                }
            }
            // Session state change listener will handle the UI
        } catch (error) {
            showAuthError(error.message);
            resetAuthBtn();
        }
    };

    function resetAuthBtn() {
        authSubmit.disabled = false;
        authSubmit.innerHTML = `<i class="fas ${isLoginMode ? 'fa-sign-in-alt' : 'fa-user-plus'}"></i> <span id="authSubmitText">${isLoginMode ? 'Giriş Yap' : 'Kayıt Ol'}</span>`;
    }

    function showAuthError(msg) {
        authError.textContent = msg;
        authError.style.display = 'block';
    }

    document.getElementById('btnSignOut').onclick = async () => {
        await supabase.auth.signOut();
    };

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            authOverlay.style.display = 'none';
            mainApp.style.display = 'block';
            resetAuthBtn();
            loadData();
            setupRealtime();
        } else {
            currentUser = null;
            authOverlay.style.display = 'flex';
            mainApp.style.display = 'none';
            state.courses = [];
            state.schedule = [];
            state.weeklyLog = {};
        }
    });

    // ===== Data Loading =====
    async function loadData() {
        try {
            // Load courses
            const { data: coursesData, error: coursesError } = await supabase
                .from('courses')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (coursesError) throw coursesError;
            state.courses = coursesData || [];

            // Load schedules
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedules')
                .select('*')
                .order('start_time', { ascending: true });

            if (scheduleError) throw scheduleError;
            state.schedule = scheduleData || [];

            // Load weekly logs
            const weekKey = getWeekKey();
            const startOfWeek = new Date(weekKey);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 7);

            const { data: logsData, error: logsError } = await supabase
                .from('attendance_logs')
                .select('*')
                .gte('logged_at', startOfWeek.toISOString())
                .lt('logged_at', endOfWeek.toISOString());
            
            if (logsError) throw logsError;

            state.weeklyLog[weekKey] = {};
            (logsData || []).forEach(log => {
                if (!state.weeklyLog[weekKey][log.course_id]) {
                    state.weeklyLog[weekKey][log.course_id] = { attended: 0, absent: 0 };
                }
                state.weeklyLog[weekKey][log.course_id][log.type]++;
            });

            renderAll();
        } catch (error) {
            console.error('Error loading data:', error);
            showToast('Veriler yüklenirken hata oluştu.', 'error');
        }
    }

    let realtimeChannel;
    function setupRealtime() {
        if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
        }
        realtimeChannel = supabase.channel('public-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `user_id=eq.${currentUser.id}` }, payload => {
                loadData(); // Re-fetch to keep simple, could be optimized
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `user_id=eq.${currentUser.id}` }, payload => {
                loadData();
            })
            .subscribe();
    }


    // ===== Toast Notifications =====
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle',
            warning: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle'
        };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="toast-icon ${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== Confetti Effects =====
    function fireConfetti() {
        if (typeof confetti !== 'function') return;
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#6C63FF', '#00D9A6', '#FFD93D', '#FF6B6B', '#A78BFA'] });
        setTimeout(() => {
            confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#6C63FF', '#00D9A6'] });
            confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#FFD93D', '#FF6B6B'] });
        }, 250);
    }

    // ===== Clock =====
    function updateClock() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        document.getElementById('clockTime').textContent = `${h}:${m}:${s}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ===== Modal Management =====
    function openModal(id) {
        document.getElementById(id).classList.add('active');
    }
    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    // ===== Course Management =====
    let selectedColor = '#6C63FF';

    async function addCourse(name, instructor, totalHours, absenceLimit, color) {
        if (!currentUser) return;
        try {
            const { error } = await supabase.from('courses').insert([{
                user_id: currentUser.id,
                name,
                instructor,
                total_hours: parseInt(totalHours),
                absence_limit: parseInt(absenceLimit),
                color,
                attended_hours: 0,
                absent_hours: 0,
                is_active: false
            }]);
            if (error) throw error;
            showToast(`"${name}" dersi eklendi!`, 'success');
            loadData();
        } catch (error) {
            showToast('Ders eklenemedi: ' + error.message, 'error');
        }
    }

    async function deleteCourse(id) {
        try {
            const course = state.courses.find(c => c.id === id);
            const { error } = await supabase.from('courses').delete().eq('id', id);
            if (error) throw error;
            showToast(`"${course?.name || 'Ders'}" silindi.`, 'info');
            fireConfetti();
            loadData();
        } catch (error) {
            showToast('Ders silinemedi: ' + error.message, 'error');
        }
    }

    async function markAttended(id) {
        const course = state.courses.find(c => c.id === id);
        if (!course) return;
        
        const newAttended = (course.attended_hours || 0) + 1;
        try {
            const { error } = await supabase.from('courses')
                .update({ attended_hours: newAttended })
                .eq('id', id);
            if (error) throw error;
            
            await logWeekly(id, 'attended');

            if (newAttended + (course.absent_hours || 0) === course.total_hours && Math.round((newAttended / course.total_hours) * 100) === 100) {
                fireConfetti();
                showToast(`🎉 "${course.name}" dersinde %100 katılım başarısı!`, 'success');
            } else {
                showToast(`"${course.name}" — Katılım kaydedildi.`, 'success');
            }
            loadData();
        } catch (error) {
             showToast('Katılım kaydedilemedi: ' + error.message, 'error');
        }
    }

    async function markAbsent(id) {
        const course = state.courses.find(c => c.id === id);
        if (!course) return;
        
        const newAbsent = (course.absent_hours || 0) + 1;
        try {
            const { error } = await supabase.from('courses')
                .update({ absent_hours: newAbsent })
                .eq('id', id);
            if (error) throw error;
            
            await logWeekly(id, 'absent');

            const absPct = Math.round((newAbsent / course.total_hours) * 100);
            if (absPct >= course.absence_limit) {
                showToast(`⚠️ "${course.name}" devamsızlık sınırını aştınız!`, 'error');
            } else if (absPct >= course.absence_limit * 0.7) {
                showToast(`"${course.name}" — Devamsızlık kritik eşiğe yakın!`, 'warning');
            } else {
                showToast(`"${course.name}" — Devamsızlık kaydedildi.`, 'warning');
            }
            loadData();
        } catch(error) {
             showToast('Devamsızlık kaydedilemedi: ' + error.message, 'error');
        }
    }

    async function toggleActive(id) {
        const course = state.courses.find(c => c.id === id);
        if (!course) return;
        
        try {
            const newStatus = !course.is_active;
            const { error } = await supabase.from('courses')
                .update({ is_active: newStatus })
                .eq('id', id);
            
            if (error) throw error;
            
            if (newStatus) {
                showToast(`📍 "${course.name}" — Derse giriş yapıldı.`, 'success');
            } else {
                showToast(`"${course.name}" — Dersten çıkış yapıldı.`, 'info');
            }
            loadData();
        } catch(error) {
            showToast('Durum güncellenemedi.', 'error');
        }
    }

    function getAttendancePercent(course) {
        const att = course.attended_hours || 0;
        const abs = course.absent_hours || 0;
        const total = att + abs;
        if (total === 0) return 0;
        return Math.round((att / total) * 100);
    }

    function getAbsencePercent(course) {
        if (!course.total_hours || course.total_hours === 0) return 0;
        return Math.round(((course.absent_hours || 0) / course.total_hours) * 100);
    }

    function getWarningLevel(course) {
        const absPct = getAbsencePercent(course);
        const limit = course.absence_limit || 30;
        if (absPct >= limit) return 'exceeded';
        if (absPct >= limit * 0.85) return 'high';
        if (absPct >= limit * 0.6) return 'low';
        return 'none';
    }

    // ===== Weekly Logging =====
    function getWeekKey() {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay() + 1);
        start.setHours(0,0,0,0);
        return start.toISOString().split('T')[0];
    }

    async function logWeekly(courseId, type) {
        try {
             await supabase.from('attendance_logs').insert([{
                 user_id: currentUser.id,
                 course_id: courseId,
                 type: type
             }]);
        } catch(error) {
            console.error('Log error', error);
        }
    }

    // ===== Schedule Management =====
    async function addScheduleEntry(day, courseId, startTime, endTime, room) {
        try {
            const { error } = await supabase.from('schedules').insert([{
                user_id: currentUser.id,
                course_id: courseId,
                day,
                start_time: startTime,
                end_time: endTime,
                room
            }]);
            if (error) throw error;
            showToast('Ders programına eklendi!', 'success');
            loadData();
        } catch(error) {
            showToast('Programa eklenemedi: ' + error.message, 'error');
        }
    }

    async function deleteScheduleEntry(id) {
         try {
            const { error } = await supabase.from('schedules').delete().eq('id', id);
            if (error) throw error;
            showToast('Program girişi silindi.', 'info');
            loadData();
        } catch(error) {
             showToast('Silinemedi: ' + error.message, 'error');
        }
    }

    // ===== Rendering =====
    function renderAll() {
        renderStats();
        renderCourses();
        renderCharts();
        renderCircularProgress();
        renderSchedule(); // Might be open
    }

    function renderStats() {
        document.getElementById('totalCourses').textContent = state.courses.length;

        if (state.courses.length > 0) {
            const totalPct = state.courses.reduce((sum, c) => sum + getAttendancePercent(c), 0);
            document.getElementById('avgAttendance').textContent = Math.round(totalPct / state.courses.length) + '%';
        } else {
            document.getElementById('avgAttendance').textContent = '0%';
        }

        const warnings = state.courses.filter(c => getWarningLevel(c) !== 'none').length;
        document.getElementById('warningCount').textContent = warnings;

        const activeCount = state.courses.filter(c => c.is_active).length;
        document.getElementById('activeNow').textContent = activeCount;
    }

    function renderCourses() {
        const grid = document.getElementById('coursesGrid');
        const empty = document.getElementById('emptyState');

        grid.querySelectorAll('.course-card').forEach(el => el.remove());

        if (state.courses.length === 0) {
            empty.style.display = 'flex';
            return;
        }
        empty.style.display = 'none';

        state.courses.forEach(course => {
            const attendPct = getAttendancePercent(course);
            const absPct = getAbsencePercent(course);
            const warnLevel = getWarningLevel(course);
            const attended = course.attended_hours || 0;
            const absent = course.absent_hours || 0;
            const total = course.total_hours || 42;
            const limit = course.absence_limit || 30;
            const remaining = total - attended - absent;

            let warningClass = '';
            if (warnLevel === 'low') warningClass = 'warning-low';
            else if (warnLevel === 'high') warningClass = 'warning-high';
            else if (warnLevel === 'exceeded') warningClass = 'warning-exceeded';

            let warningBadge = '';
            if (warnLevel === 'low') {
                warningBadge = `<div class="warning-badge yellow"><i class="fas fa-exclamation-triangle"></i> Devamsızlık uyarısı — %${absPct}</div>`;
            } else if (warnLevel === 'high') {
                warningBadge = `<div class="warning-badge red"><i class="fas fa-exclamation-circle"></i> Kritik seviye — %${absPct}</div>`;
            } else if (warnLevel === 'exceeded') {
                warningBadge = `<div class="warning-badge red"><i class="fas fa-ban"></i> Sınır aşıldı — %${absPct}</div>`;
            }

            let liveBadge = '';
            if (course.is_active) {
                liveBadge = `<div class="live-badge"><span class="pulse-dot"></span>Şu an derste</div>`;
            }

            const card = document.createElement('div');
            card.className = `course-card glass-card ${warningClass}`;
            card.style.setProperty('--card-accent', course.color);
            card.innerHTML = `
                <div class="course-card-header">
                    <div>
                        <div class="course-card-title">${escapeHtml(course.name)}</div>
                        <div class="course-card-instructor">${escapeHtml(course.instructor || '-')}</div>
                    </div>
                    ${liveBadge}
                </div>
                ${warningBadge}
                <div class="course-card-stats">
                    <div class="card-stat">
                        <div class="card-stat-label">Katılım</div>
                        <div class="card-stat-value" style="color:${course.color}">${attended}/${total}</div>
                    </div>
                    <div class="card-stat">
                        <div class="card-stat-label">Devamsızlık</div>
                        <div class="card-stat-value" style="color:${absPct >= limit ? 'var(--accent-red)' : 'var(--text-primary)'}">${absent} <small style="font-size:11px;color:var(--text-muted)">(%${absPct})</small></div>
                    </div>
                    <div class="card-stat">
                        <div class="card-stat-label">Katılım Oranı</div>
                        <div class="card-stat-value">%${attendPct}</div>
                    </div>
                    <div class="card-stat">
                        <div class="card-stat-label">Kalan</div>
                        <div class="card-stat-value">${Math.max(0, remaining)} saat</div>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width:${(attended / total) * 100}%; background:${course.color};"></div>
                </div>
                <div class="course-card-actions">
                    <button class="btn btn-success btn-sm btn-attend" data-id="${course.id}" title="Katıldım"><i class="fas fa-check"></i> Katıldım</button>
                    <button class="btn btn-danger btn-sm btn-absent" data-id="${course.id}" title="Gelmedim"><i class="fas fa-times"></i> Gelmedim</button>
                    <button class="btn ${course.is_active ? 'btn-active-class' : 'btn-ghost'} btn-sm btn-toggle-active" data-id="${course.id}" title="Dersteyim"><i class="fas fa-broadcast-tower"></i></button>
                    <button class="btn btn-ghost btn-sm btn-delete" data-id="${course.id}" title="Sil"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            grid.appendChild(card);
        });

        // Event delegation
        grid.querySelectorAll('.btn-attend').forEach(btn => btn.onclick = () => markAttended(btn.dataset.id));
        grid.querySelectorAll('.btn-absent').forEach(btn => btn.onclick = () => markAbsent(btn.dataset.id));
        grid.querySelectorAll('.btn-toggle-active').forEach(btn => btn.onclick = () => toggleActive(btn.dataset.id));
        grid.querySelectorAll('.btn-delete').forEach(btn => btn.onclick = () => { if (confirm('Bu dersi silmek istediğinize emin misiniz?')) deleteCourse(btn.dataset.id); });
    }

    function escapeHtml(text) {
        if (!text) return '';
        const el = document.createElement('span');
        el.textContent = text;
        return el.innerHTML;
    }

    // ===== Charts =====
    let weeklyChartInstance = null;

    function renderCharts() {
        const ctx = document.getElementById('weeklyChart');
        if (!ctx) return;

        const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        const weekKey = getWeekKey();
        const weekData = state.weeklyLog[weekKey] || {};

        let attendedData = new Array(7).fill(0);
        let absentData = new Array(7).fill(0);

        const today = new Date().getDay();
        const todayIdx = today === 0 ? 6 : today - 1;

        Object.values(weekData).forEach(cData => {
            attendedData[todayIdx] += cData.attended || 0;
            absentData[todayIdx] += cData.absent || 0;
        });

        // Random fill for previous days for visual effect (optional, could be removed for accurate empty charts)
        for (let i = 0; i < 7; i++) {
            if (i !== todayIdx && i <= todayIdx) {
                attendedData[i] = Math.floor(Math.random() * 2);
            }
        }

        if (state.courses.length === 0) {
            attendedData = new Array(7).fill(0);
            absentData = new Array(7).fill(0);
        }

        if (weeklyChartInstance) weeklyChartInstance.destroy();

        weeklyChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Katılım',
                        data: attendedData,
                        borderColor: '#6C63FF',
                        backgroundColor: 'rgba(108, 99, 255, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#6C63FF',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    },
                    {
                        label: 'Devamsızlık',
                        data: absentData,
                        borderColor: '#FF6B6B',
                        backgroundColor: 'rgba(255, 107, 107, 0.08)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#FF6B6B',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, usePointStyle: true, padding: 20 } },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        titleFont: { family: 'Inter', weight: '600' },
                        bodyFont: { family: 'Inter' }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 11 }, stepSize: 1 }, beginAtZero: true }
                }
            }
        });
    }

    function renderCircularProgress() {
        const container = document.getElementById('circularProgressContainer');
        const emptyMsg = document.getElementById('emptyChartMsg');
        container.querySelectorAll('.circular-progress-item').forEach(el => el.remove());

        if (state.courses.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'flex';
            return;
        }
        if (emptyMsg) emptyMsg.style.display = 'none';

        state.courses.forEach(course => {
            const pct = getAttendancePercent(course);
            const circumference = 2 * Math.PI * 38;
            const offset = circumference - (pct / 100) * circumference;

            const item = document.createElement('div');
            item.className = 'circular-progress-item';
            item.innerHTML = `
                <div class="circular-progress-wrapper">
                    <svg width="90" height="90" viewBox="0 0 90 90">
                        <circle class="progress-bg" cx="45" cy="45" r="38"/>
                        <circle class="progress-bar" cx="45" cy="45" r="38"
                            stroke="${course.color}"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <div class="circular-progress-value" style="color:${course.color}">%${pct}</div>
                </div>
                <div class="circular-progress-label" title="${escapeHtml(course.name)}">${escapeHtml(course.name)}</div>
            `;
            container.appendChild(item);
        });
    }

    // ===== Schedule Rendering =====
    function renderSchedule() {
        const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
        days.forEach(day => {
            const container = document.getElementById('slots-' + day);
            if (!container) return;
            container.innerHTML = '';
            const entries = state.schedule
                .filter(s => s.day === day)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));

            entries.forEach(entry => {
                const course = state.courses.find(c => c.id === entry.course_id);
                const courseName = course ? course.name : 'Silinmiş Ders';
                const color = course ? course.color : '#64748b';
                const slot = document.createElement('div');
                slot.className = 'schedule-slot';
                slot.style.setProperty('--slot-color', color);
                slot.innerHTML = `
                    <div class="schedule-slot-name">${escapeHtml(courseName)}</div>
                    <div class="schedule-slot-time"><i class="fas fa-clock"></i> ${entry.start_time} - ${entry.end_time}</div>
                    ${entry.room ? `<div class="schedule-slot-room"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(entry.room)}</div>` : ''}
                    <button class="schedule-slot-delete" data-id="${entry.id}" title="Sil"><i class="fas fa-times"></i></button>
                `;
                container.appendChild(slot);
            });
        });

        document.querySelectorAll('.schedule-slot-delete').forEach(btn => {
            btn.onclick = () => deleteScheduleEntry(btn.dataset.id);
        });
    }

    function populateCourseDatalist() {
        const datalist = document.getElementById('courseList');
        if (!datalist) return;
        datalist.innerHTML = '';
        state.courses.forEach(c => {
            const option = document.createElement('option');
            option.value = c.name;
            datalist.appendChild(option);
        });
    }

    // ===== Event Listeners =====
    // Add Course Modal
    document.getElementById('btnAddCourse').onclick = () => openModal('addCourseModal');
    document.getElementById('closeAddCourse').onclick = () => closeModal('addCourseModal');
    document.getElementById('cancelAddCourse').onclick = () => closeModal('addCourseModal');
    document.getElementById('addCourseModal').onclick = (e) => { if (e.target === e.currentTarget) closeModal('addCourseModal'); };

    // Color Picker
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.onclick = () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            selectedColor = swatch.dataset.color;
        };
    });

    // Save Course
    document.getElementById('saveCourse').onclick = () => {
        const name = document.getElementById('courseName').value.trim();
        const instructor = document.getElementById('courseInstructor').value.trim();
        const totalHours = document.getElementById('totalHours').value;
        const absenceLimit = document.getElementById('absenceLimit').value;

        if (!name) { showToast('Ders adını girin.', 'error'); return; }
        if (!totalHours || parseInt(totalHours) < 1) { showToast('Geçerli bir ders saati girin.', 'error'); return; }
        if (!absenceLimit || parseInt(absenceLimit) < 1 || parseInt(absenceLimit) > 100) { showToast('Geçerli bir devamsızlık sınırı girin.', 'error'); return; }

        addCourse(name, instructor || '-', totalHours, absenceLimit, selectedColor);
        closeModal('addCourseModal');
        document.getElementById('courseName').value = '';
        document.getElementById('courseInstructor').value = '';
        document.getElementById('totalHours').value = '';
        document.getElementById('absenceLimit').value = '30';
    };

    // Schedule Modal
    document.getElementById('btnSchedule').onclick = () => { populateCourseDatalist(); renderSchedule(); openModal('scheduleModal'); };
    document.getElementById('closeSchedule').onclick = () => closeModal('scheduleModal');
    document.getElementById('scheduleModal').onclick = (e) => { if (e.target === e.currentTarget) closeModal('scheduleModal'); };

    // Add Schedule Entry Modal
    document.getElementById('btnAddScheduleEntry').onclick = () => { 
        populateCourseDatalist(); 
        document.getElementById('scheduleCourse').value = '';
        openModal('addScheduleEntryModal'); 
    };
    document.getElementById('closeAddScheduleEntry').onclick = () => closeModal('addScheduleEntryModal');
    document.getElementById('cancelAddScheduleEntry').onclick = () => closeModal('addScheduleEntryModal');
    document.getElementById('addScheduleEntryModal').onclick = (e) => { if (e.target === e.currentTarget) closeModal('addScheduleEntryModal'); };

    // Save Schedule Entry
    document.getElementById('saveScheduleEntry').onclick = () => {
        const day = document.getElementById('scheduleDay').value;
        const courseName = document.getElementById('scheduleCourse').value.trim();
        const startTime = document.getElementById('scheduleStart').value;
        const endTime = document.getElementById('scheduleEnd').value;
        const room = document.getElementById('scheduleRoom').value.trim();

        const course = state.courses.find(c => c.name.toLowerCase() === courseName.toLowerCase());

        if (!courseName) { showToast('Lütfen bir ders adı girin.', 'error'); return; }
        if (!course) { showToast('Bu isimde bir ders bulunamadı. Lütfen önce "Ders Ekle" kısmından dersi oluşturun.', 'error'); return; }
        
        const courseId = course.id;
        if (!startTime || !endTime) { showToast('Başlangıç ve bitiş saatini girin.', 'error'); return; }
        if (startTime >= endTime) { showToast('Bitiş saati başlangıçtan sonra olmalı.', 'error'); return; }

        addScheduleEntry(day, courseId, startTime, endTime, room);
        closeModal('addScheduleEntryModal');
        document.getElementById('scheduleRoom').value = '';
    };

    // Mobile Bottom Nav Buttons
    const btnMobileAdd = document.getElementById('btnMobileAdd');
    if (btnMobileAdd) btnMobileAdd.onclick = () => openModal('addCourseModal');

    const btnMobileSchedule = document.getElementById('btnMobileSchedule');
    if (btnMobileSchedule) btnMobileSchedule.onclick = () => { populateCourseDatalist(); renderSchedule(); openModal('scheduleModal'); };

    // Scroll Spy for Bottom Nav
    window.addEventListener('scroll', () => {
        const navItems = document.querySelectorAll('.mobile-bottom-nav .nav-item');
        if (navItems.length === 0) return;

        const sections = [
            { id: 'topNav', index: 0 },
            { id: 'statsOverview', index: 3 },
            { id: 'coursesGrid', index: 4 }
        ];

        let currentActive = 0;
        const scrollPos = window.scrollY + 100;

        sections.forEach(sec => {
            const el = document.getElementById(sec.id);
            if (el && scrollPos >= el.offsetTop) {
                currentActive = sec.index;
            }
        });

        navItems.forEach((item, idx) => {
            if (idx === currentActive) item.classList.add('active');
            else item.classList.remove('active');
        });
    });

})();
