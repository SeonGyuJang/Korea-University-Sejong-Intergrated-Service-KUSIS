// ===========================
// 학습 분석 페이지 - 메인 스크립트
// ===========================

(function() {
    'use strict';

    // ===========================
    // 전역 상태 관리
    // ===========================
    const state = {
        currentSemester: null,
        allSemesters: [],
        subjects: [],
        currentPeriod: 'daily', // daily, weekly, monthly
        currentDate: new Date(),
        studyData: null,
        timer: {
            isRunning: false,
            isPaused: false,
            seconds: 0,
            interval: null,
            selectedSubject: null,
            startTime: null
        },
        charts: {
            main: null,
            subject: null,
            pattern: null
        },
        dailyGoal: 2 // 기본 목표: 2시간/일
    };

    // ===========================
    // DOM 요소
    // ===========================
    const elements = {
        // 헤더
        semesterSelect: document.getElementById('semesterSelect'),
        refreshBtn: document.getElementById('refreshBtn'),

        // 기간 선택
        periodBtns: document.querySelectorAll('.period-btn'),

        // 날짜 네비게이션
        prevDateBtn: document.getElementById('prevDateBtn'),
        nextDateBtn: document.getElementById('nextDateBtn'),
        todayBtn: document.getElementById('todayBtn'),
        currentPeriodText: document.getElementById('currentPeriodText'),

        // 요약 카드
        totalStudyTime: document.getElementById('totalStudyTime'),
        studyStreak: document.getElementById('studyStreak'),
        dailyAverage: document.getElementById('dailyAverage'),
        goalProgress: document.getElementById('goalProgress'),
        timeChange: document.getElementById('timeChange'),
        avgChange: document.getElementById('avgChange'),

        // 차트
        mainChartCanvas: document.getElementById('mainChart'),
        subjectChartCanvas: document.getElementById('subjectChart'),
        patternChartCanvas: document.getElementById('patternChart'),

        // 과목 뷰
        viewToggleBtns: document.querySelectorAll('.toggle-btn'),
        subjectChartView: document.getElementById('subjectChartView'),
        subjectListView: document.getElementById('subjectListView'),
        subjectList: document.getElementById('subjectList'),

        // 타이머
        timerSubject: document.getElementById('timerSubject'),
        timerDisplay: document.getElementById('timerDisplay'),
        timerStatus: document.getElementById('timerStatus'),
        timerCircle: document.getElementById('timerCircle'),
        startBtn: document.getElementById('startBtn'),
        pauseBtn: document.getElementById('pauseBtn'),
        stopBtn: document.getElementById('stopBtn'),
        quickButtons: document.getElementById('quickButtons'),

        // 인사이트
        bestSubject: document.getElementById('bestSubject'),
        bestTime: document.getElementById('bestTime'),
        avgFocus: document.getElementById('avgFocus'),
        weekTrend: document.getElementById('weekTrend'),

        // 활동
        activityList: document.getElementById('activityList'),

        // 목표
        dailyGoalInput: document.getElementById('dailyGoal'),
        goalRing: document.getElementById('goalRing'),
        goalPercentage: document.getElementById('goalPercentage'),
        saveGoalBtn: document.getElementById('saveGoalBtn'),

        // 로딩 & 알림
        loadingOverlay: document.getElementById('loadingOverlay'),
        notificationToast: document.getElementById('notificationToast')
    };

    // ===========================
    // 유틸리티 함수
    // ===========================
    const utils = {
        // 초를 시:분:초 형식으로 변환
        formatTime(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        },

        // 초를 "Xh Ym" 형식으로 변환
        formatDuration(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);

            if (hours === 0 && minutes === 0) return '0분';
            if (hours === 0) return `${minutes}분`;
            if (minutes === 0) return `${hours}시간`;
            return `${hours}시간 ${minutes}분`;
        },

        // 날짜를 YYYY-MM-DD 형식으로 변환
        formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        },

        // 날짜를 한국어 형식으로 표시
        formatDateKorean(date) {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
            return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
        },

        // 주의 시작일과 종료일 계산
        getWeekRange(date) {
            const start = new Date(date);
            start.setDate(date.getDate() - date.getDay()); // 일요일
            const end = new Date(start);
            end.setDate(start.getDate() + 6); // 토요일
            return { start, end };
        },

        // 월의 시작일과 종료일 계산
        getMonthRange(date) {
            const start = new Date(date.getFullYear(), date.getMonth(), 1);
            const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            return { start, end };
        },

        // 기간별 텍스트 생성
        getPeriodText(period, date) {
            if (period === 'daily') {
                return this.formatDateKorean(date);
            } else if (period === 'weekly') {
                const { start, end } = this.getWeekRange(date);
                return `${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
            } else if (period === 'monthly') {
                return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
            }
            return '';
        },

        // 날짜 배열 생성
        getDateArray(period, date) {
            if (period === 'daily') {
                return [new Date(date)];
            } else if (period === 'weekly') {
                const dates = [];
                const { start } = this.getWeekRange(date);
                for (let i = 0; i < 7; i++) {
                    const d = new Date(start);
                    d.setDate(start.getDate() + i);
                    dates.push(d);
                }
                return dates;
            } else if (period === 'monthly') {
                const dates = [];
                const { start, end } = this.getMonthRange(date);
                const current = new Date(start);
                while (current <= end) {
                    dates.push(new Date(current));
                    current.setDate(current.getDate() + 1);
                }
                return dates;
            }
            return [];
        },

        // 차트 색상 생성
        getChartColors(count) {
            const colors = [
                '#a41e35', '#3498db', '#27ae60', '#f39c12',
                '#9b59b6', '#1abc9c', '#e74c3c', '#34495e'
            ];
            return colors.slice(0, count);
        },

        // 로딩 표시/숨김
        showLoading(show = true) {
            if (elements.loadingOverlay) {
                elements.loadingOverlay.style.display = show ? 'flex' : 'none';
            }
        },

        // 알림 토스트 표시
        showNotification(message, type = 'info') {
            if (!elements.notificationToast) return;

            elements.notificationToast.textContent = message;
            elements.notificationToast.className = `notification-toast show ${type}`;

            setTimeout(() => {
                elements.notificationToast.classList.remove('show');
            }, 3000);
        },

        // 로컬 스토리지에서 목표 가져오기
        loadGoal() {
            const saved = localStorage.getItem('dailyStudyGoal');
            return saved ? parseFloat(saved) : 2;
        },

        // 로컬 스토리지에 목표 저장
        saveGoal(hours) {
            localStorage.setItem('dailyStudyGoal', hours.toString());
        }
    };

    // ===========================
    // API 호출 함수
    // ===========================
    const api = {
        // 학기 목록 가져오기
        async getSemesters() {
            const response = await fetch('/api/semesters');
            if (!response.ok) throw new Error('학기 목록을 불러올 수 없습니다.');
            return await response.json();
        },

        // 과목 목록 가져오기
        async getSubjects(semesterId) {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error('과목 목록을 불러올 수 없습니다.');
            const data = await response.json();
            return data.subjects || [];
        },

        // 학습 분석 데이터 가져오기
        async getStudyData(semesterId, period, date) {
            const dateStr = utils.formatDate(date);
            const response = await fetch(
                `/api/study-analysis-data?semester_id=${semesterId}&period=${period}&date_str=${dateStr}`
            );
            if (!response.ok) throw new Error('학습 데이터를 불러올 수 없습니다.');
            return await response.json();
        },

        // 공부 시간 저장 (과목별)
        async saveStudyTime(subjectId, seconds, date) {
            const response = await fetch('/api/study-log/subject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject_id: subjectId,
                    duration_seconds: seconds,
                    date_str: utils.formatDate(date)
                })
            });
            if (!response.ok) throw new Error('학습 시간을 저장할 수 없습니다.');
            return await response.json();
        },

        // 공부 시간 저장 (개인)
        async savePersonalStudyTime(seconds, date) {
            const response = await fetch('/api/study-time', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duration_to_add: seconds,
                    date: utils.formatDate(date)
                })
            });
            if (!response.ok) throw new Error('학습 시간을 저장할 수 없습니다.');
            return await response.json();
        }
    };

    // ===========================
    // 차트 관리
    // ===========================
    const charts = {
        // 메인 차트 초기화/업데이트
        updateMainChart(labels, data) {
            const ctx = elements.mainChartCanvas.getContext('2d');

            if (state.charts.main) {
                state.charts.main.destroy();
            }

            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(164, 30, 53, 0.3)');
            gradient.addColorStop(1, 'rgba(164, 30, 53, 0.05)');

            state.charts.main = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '학습 시간 (분)',
                        data: data.map(d => Math.round(d / 60)), // 초 → 분
                        borderColor: '#a41e35',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#a41e35',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const minutes = context.parsed.y;
                                    const hours = Math.floor(minutes / 60);
                                    const mins = minutes % 60;
                                    if (hours > 0) {
                                        return `${hours}시간 ${mins}분`;
                                    }
                                    return `${mins}분`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value + '분';
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        },

        // 과목별 차트 초기화/업데이트
        updateSubjectChart(subjectData) {
            const ctx = elements.subjectChartCanvas.getContext('2d');

            if (state.charts.subject) {
                state.charts.subject.destroy();
            }

            if (!subjectData || subjectData.length === 0) {
                // 데이터 없을 때 빈 차트
                state.charts.subject = null;
                return;
            }

            const labels = subjectData.map(d => d.name);
            const data = subjectData.map(d => Math.round(d.time / 60)); // 초 → 분
            const colors = utils.getChartColors(subjectData.length);

            state.charts.subject = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 3,
                        borderColor: '#fff',
                        hoverBorderWidth: 4,
                        hoverBorderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const minutes = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((minutes / total) * 100).toFixed(1);
                                    const hours = Math.floor(minutes / 60);
                                    const mins = minutes % 60;
                                    let timeStr = '';
                                    if (hours > 0) {
                                        timeStr = `${hours}시간 ${mins}분`;
                                    } else {
                                        timeStr = `${mins}분`;
                                    }
                                    return `${label}: ${timeStr} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        },

        // 시간대별 패턴 차트
        updatePatternChart(hourlyData) {
            const ctx = elements.patternChartCanvas.getContext('2d');

            if (state.charts.pattern) {
                state.charts.pattern.destroy();
            }

            // 0-23시 레이블
            const labels = Array.from({ length: 24 }, (_, i) => `${i}시`);
            // hourlyData가 없으면 빈 배열
            const data = Array(24).fill(0);

            if (hourlyData && typeof hourlyData === 'object') {
                Object.keys(hourlyData).forEach(hour => {
                    const h = parseInt(hour);
                    if (h >= 0 && h < 24) {
                        data[h] = Math.round(hourlyData[hour] / 60); // 초 → 분
                    }
                });
            }

            state.charts.pattern = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '학습 시간 (분)',
                        data: data,
                        backgroundColor: 'rgba(164, 30, 53, 0.6)',
                        borderColor: '#a41e35',
                        borderWidth: 2,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const minutes = context.parsed.y;
                                    if (minutes === 0) return '학습 없음';
                                    const hours = Math.floor(minutes / 60);
                                    const mins = minutes % 60;
                                    if (hours > 0) {
                                        return `${hours}시간 ${mins}분`;
                                    }
                                    return `${mins}분`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value + '분';
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }
    };

    // ===========================
    // UI 업데이트 함수
    // ===========================
    const ui = {
        // 학기 드롭다운 업데이트
        updateSemesterSelect() {
            elements.semesterSelect.innerHTML = '';

            if (state.allSemesters.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '등록된 학기 없음';
                elements.semesterSelect.appendChild(option);
                return;
            }

            state.allSemesters.forEach(semester => {
                const option = document.createElement('option');
                option.value = semester.id;
                option.textContent = semester.name;
                elements.semesterSelect.appendChild(option);
            });

            if (state.currentSemester) {
                elements.semesterSelect.value = state.currentSemester.id;
            }
        },

        // 과목 드롭다운 업데이트
        updateSubjectSelect() {
            elements.timerSubject.innerHTML = '<option value="">개인 공부</option>';

            state.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name;
                elements.timerSubject.appendChild(option);
            });
        },

        // 빠른 시작 버튼 업데이트
        updateQuickButtons() {
            elements.quickButtons.innerHTML = '';

            if (state.subjects.length === 0) {
                const empty = document.createElement('p');
                empty.textContent = '등록된 과목이 없습니다';
                empty.style.gridColumn = '1 / -1';
                empty.style.textAlign = 'center';
                empty.style.color = 'var(--text-light)';
                empty.style.fontSize = '0.875rem';
                elements.quickButtons.appendChild(empty);
                return;
            }

            // 최대 4개까지만 표시
            const displaySubjects = state.subjects.slice(0, 4);
            displaySubjects.forEach(subject => {
                const btn = document.createElement('button');
                btn.className = 'quick-btn';
                btn.textContent = subject.name;
                btn.dataset.subjectId = subject.id;
                btn.addEventListener('click', () => {
                    elements.timerSubject.value = subject.id;
                    timer.start();
                });
                elements.quickButtons.appendChild(btn);
            });
        },

        // 날짜 네비게이션 텍스트 업데이트
        updateDateNavigation() {
            const text = utils.getPeriodText(state.currentPeriod, state.currentDate);
            elements.currentPeriodText.textContent = text;
        },

        // 요약 카드 업데이트
        updateSummaryCards(data) {
            // 총 시간
            const totalSeconds = data.total_time || 0;
            elements.totalStudyTime.textContent = utils.formatDuration(totalSeconds);

            // 시간 변화 (전 기간 대비)
            if (data.previous_total !== undefined) {
                const change = totalSeconds - data.previous_total;
                if (change > 0) {
                    elements.timeChange.textContent = `▲ ${utils.formatDuration(change)}`;
                    elements.timeChange.style.color = 'var(--success-color)';
                } else if (change < 0) {
                    elements.timeChange.textContent = `▼ ${utils.formatDuration(Math.abs(change))}`;
                    elements.timeChange.style.color = 'var(--danger-color)';
                } else {
                    elements.timeChange.textContent = '변화 없음';
                    elements.timeChange.style.color = 'var(--text-light)';
                }
            }

            // 연속 학습 일수
            const streak = data.streak || 0;
            elements.studyStreak.textContent = `${streak}일`;

            // 일일 평균
            const avgSeconds = data.daily_average || 0;
            elements.dailyAverage.textContent = utils.formatDuration(avgSeconds);

            // 목표 달성률
            if (state.currentPeriod === 'daily') {
                const goalSeconds = state.dailyGoal * 3600;
                const progress = Math.min(100, (totalSeconds / goalSeconds) * 100);
                elements.goalProgress.textContent = `${Math.round(progress)}%`;
                this.updateGoalRing(progress);
            } else {
                elements.goalProgress.textContent = '-';
            }
        },

        // 과목별 리스트 뷰 업데이트
        updateSubjectList(subjectData) {
            elements.subjectList.innerHTML = '';

            if (!subjectData || subjectData.length === 0) {
                elements.subjectList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>데이터가 없습니다</p>
                    </div>
                `;
                return;
            }

            const total = subjectData.reduce((sum, d) => sum + d.time, 0);
            const colors = utils.getChartColors(subjectData.length);

            subjectData.forEach((subject, index) => {
                const percentage = total > 0 ? ((subject.time / total) * 100).toFixed(1) : 0;

                const item = document.createElement('div');
                item.className = 'subject-item';
                item.innerHTML = `
                    <div class="subject-info">
                        <div class="subject-color" style="background: ${colors[index]};"></div>
                        <span class="subject-name">${subject.name}</span>
                    </div>
                    <div>
                        <span class="subject-time">${utils.formatDuration(subject.time)}</span>
                        <span class="subject-percentage">${percentage}%</span>
                    </div>
                `;
                elements.subjectList.appendChild(item);
            });
        },

        // 인사이트 업데이트
        updateInsights(data) {
            // 최고 집중 과목
            if (data.subject_data && data.subject_data.length > 0) {
                const topSubject = data.subject_data.reduce((max, s) => s.time > max.time ? s : max);
                elements.bestSubject.textContent = topSubject.name;
            } else {
                elements.bestSubject.textContent = '-';
            }

            // 최적 학습 시간 (가장 많이 공부한 시간대)
            if (data.hourly_data && typeof data.hourly_data === 'object') {
                let maxHour = 0;
                let maxTime = 0;
                Object.keys(data.hourly_data).forEach(hour => {
                    if (data.hourly_data[hour] > maxTime) {
                        maxTime = data.hourly_data[hour];
                        maxHour = parseInt(hour);
                    }
                });
                if (maxTime > 0) {
                    elements.bestTime.textContent = `${maxHour}시 ~ ${maxHour + 1}시`;
                } else {
                    elements.bestTime.textContent = '-';
                }
            } else {
                elements.bestTime.textContent = '-';
            }

            // 평균 집중 시간 (세션 당 평균)
            const avgFocus = data.average_session || 0;
            elements.avgFocus.textContent = avgFocus > 0 ? utils.formatDuration(avgFocus) : '-';

            // 주간 트렌드
            if (data.week_trend !== undefined) {
                const trend = data.week_trend;
                if (trend > 0) {
                    elements.weekTrend.textContent = `▲ ${trend}% 증가`;
                    elements.weekTrend.style.color = 'var(--success-color)';
                } else if (trend < 0) {
                    elements.weekTrend.textContent = `▼ ${Math.abs(trend)}% 감소`;
                    elements.weekTrend.style.color = 'var(--danger-color)';
                } else {
                    elements.weekTrend.textContent = '변화 없음';
                    elements.weekTrend.style.color = 'var(--text-secondary)';
                }
            } else {
                elements.weekTrend.textContent = '-';
            }
        },

        // 최근 활동 업데이트
        updateRecentActivity(data) {
            elements.activityList.innerHTML = '';

            if (!data.recent_logs || data.recent_logs.length === 0) {
                elements.activityList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-clipboard-list"></i>
                        <p>최근 활동이 없습니다</p>
                    </div>
                `;
                return;
            }

            data.recent_logs.forEach(log => {
                const item = document.createElement('div');
                item.className = 'activity-item';

                const date = new Date(log.date);
                const timeAgo = this.getTimeAgo(date);
                const subjectName = log.subject_name || '개인 공부';

                item.innerHTML = `
                    <div class="activity-icon">
                        <i class="fas fa-book-open"></i>
                    </div>
                    <div class="activity-details">
                        <div class="activity-title">${subjectName}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                    <div class="activity-duration">${utils.formatDuration(log.duration)}</div>
                `;
                elements.activityList.appendChild(item);
            });
        },

        // 시간 경과 표시
        getTimeAgo(date) {
            const now = new Date();
            const diff = now - date;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor(diff / (1000 * 60));

            if (days > 0) return `${days}일 전`;
            if (hours > 0) return `${hours}시간 전`;
            if (minutes > 0) return `${minutes}분 전`;
            return '방금 전';
        },

        // 목표 링 업데이트
        updateGoalRing(percentage) {
            const circumference = 314; // 2 * PI * 50
            const offset = circumference - (circumference * percentage / 100);
            elements.goalRing.style.strokeDashoffset = offset;
            elements.goalPercentage.textContent = `${Math.round(percentage)}%`;
        }
    };

    // ===========================
    // 타이머 관리
    // ===========================
    const timer = {
        start() {
            if (state.timer.isRunning) return;

            state.timer.isRunning = true;
            state.timer.isPaused = false;
            state.timer.startTime = Date.now() - (state.timer.seconds * 1000);
            state.timer.selectedSubject = elements.timerSubject.value || null;

            this.updateUI();
            this.updateInterval();

            state.timer.interval = setInterval(() => {
                state.timer.seconds = Math.floor((Date.now() - state.timer.startTime) / 1000);
                this.updateDisplay();
                this.updateCircle();
            }, 1000);
        },

        pause() {
            if (!state.timer.isRunning || state.timer.isPaused) return;

            state.timer.isPaused = true;
            clearInterval(state.timer.interval);
            this.updateUI();
        },

        resume() {
            if (!state.timer.isRunning || !state.timer.isPaused) return;

            state.timer.isPaused = false;
            state.timer.startTime = Date.now() - (state.timer.seconds * 1000);
            this.updateUI();

            state.timer.interval = setInterval(() => {
                state.timer.seconds = Math.floor((Date.now() - state.timer.startTime) / 1000);
                this.updateDisplay();
                this.updateCircle();
            }, 1000);
        },

        async stop() {
            if (!state.timer.isRunning) return;

            clearInterval(state.timer.interval);

            const seconds = state.timer.seconds;
            const subjectId = state.timer.selectedSubject;

            // 최소 1분 이상만 저장
            if (seconds < 60) {
                utils.showNotification('최소 1분 이상 공부해야 기록됩니다.', 'warning');
                this.reset();
                return;
            }

            utils.showLoading(true);

            try {
                // API 호출
                if (subjectId) {
                    await api.saveStudyTime(subjectId, seconds, new Date());
                } else {
                    await api.savePersonalStudyTime(seconds, new Date());
                }

                utils.showNotification(`${utils.formatDuration(seconds)} 학습 완료!`, 'success');

                // 데이터 새로고침
                await loadStudyData();
            } catch (error) {
                console.error('Error saving study time:', error);
                utils.showNotification('학습 시간 저장 실패', 'error');
            } finally {
                utils.showLoading(false);
                this.reset();
            }
        },

        reset() {
            state.timer.isRunning = false;
            state.timer.isPaused = false;
            state.timer.seconds = 0;
            state.timer.selectedSubject = null;
            state.timer.startTime = null;
            this.updateDisplay();
            this.updateCircle();
            this.updateUI();
        },

        updateDisplay() {
            elements.timerDisplay.textContent = utils.formatTime(state.timer.seconds);
        },

        updateCircle() {
            // 최대 2시간(7200초)을 기준으로 원 채우기
            const maxSeconds = 7200;
            const progress = Math.min(state.timer.seconds / maxSeconds, 1);
            const circumference = 534; // 2 * PI * 85
            const offset = circumference - (circumference * progress);
            elements.timerCircle.style.strokeDashoffset = offset;
        },

        updateInterval() {
            // SVG 그라데이션 동적 생성
            const svg = elements.timerCircle.closest('svg');
            let defs = svg.querySelector('defs');
            if (!defs) {
                defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                svg.insertBefore(defs, svg.firstChild);
            }

            defs.innerHTML = `
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#a41e35;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#c73850;stop-opacity:1" />
                </linearGradient>
            `;
        },

        updateUI() {
            if (state.timer.isRunning) {
                if (state.timer.isPaused) {
                    elements.timerStatus.textContent = '일시정지';
                    elements.startBtn.disabled = true;
                    elements.pauseBtn.disabled = true;
                    elements.stopBtn.disabled = false;
                    elements.pauseBtn.innerHTML = '<i class="fas fa-play"></i><span>재개</span>';
                    elements.timerSubject.disabled = true;
                } else {
                    elements.timerStatus.textContent = '측정 중';
                    elements.startBtn.disabled = true;
                    elements.pauseBtn.disabled = false;
                    elements.stopBtn.disabled = false;
                    elements.pauseBtn.innerHTML = '<i class="fas fa-pause"></i><span>일시정지</span>';
                    elements.timerSubject.disabled = true;
                }
            } else {
                elements.timerStatus.textContent = '준비';
                elements.startBtn.disabled = false;
                elements.pauseBtn.disabled = true;
                elements.stopBtn.disabled = true;
                elements.pauseBtn.innerHTML = '<i class="fas fa-pause"></i><span>일시정지</span>';
                elements.timerSubject.disabled = false;
            }
        }
    };

    // ===========================
    // 데이터 로드
    // ===========================
    async function loadSemesters() {
        try {
            state.allSemesters = await api.getSemesters();

            if (state.allSemesters.length > 0) {
                // 첫 번째 학기를 기본값으로
                state.currentSemester = state.allSemesters[0];
            }

            ui.updateSemesterSelect();
        } catch (error) {
            console.error('Error loading semesters:', error);
            utils.showNotification('학기 목록을 불러올 수 없습니다.', 'error');
        }
    }

    async function loadSubjects() {
        if (!state.currentSemester) {
            state.subjects = [];
            ui.updateSubjectSelect();
            ui.updateQuickButtons();
            return;
        }

        try {
            state.subjects = await api.getSubjects(state.currentSemester.id);
            ui.updateSubjectSelect();
            ui.updateQuickButtons();
        } catch (error) {
            console.error('Error loading subjects:', error);
            utils.showNotification('과목 목록을 불러올 수 없습니다.', 'error');
        }
    }

    async function loadStudyData() {
        if (!state.currentSemester) {
            utils.showNotification('학기를 선택해주세요.', 'warning');
            return;
        }

        utils.showLoading(true);

        try {
            const data = await api.getStudyData(
                state.currentSemester.id,
                state.currentPeriod,
                state.currentDate
            );

            state.studyData = data;

            // UI 업데이트
            updateAllUI(data);
        } catch (error) {
            console.error('Error loading study data:', error);
            utils.showNotification('학습 데이터를 불러올 수 없습니다.', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    function updateAllUI(data) {
        // 날짜 네비게이션
        ui.updateDateNavigation();

        // 요약 카드
        ui.updateSummaryCards(data);

        // 메인 차트
        const dates = utils.getDateArray(state.currentPeriod, state.currentDate);
        let labels;
        if (state.currentPeriod === 'daily') {
            labels = Array.from({ length: 24 }, (_, i) => `${i}시`);
        } else if (state.currentPeriod === 'weekly') {
            labels = ['일', '월', '화', '수', '목', '금', '토'];
        } else {
            labels = dates.map(d => `${d.getDate()}일`);
        }

        const chartData = data.timeseries_data || [];
        charts.updateMainChart(labels, chartData);

        // 과목별 차트
        const subjectData = data.subject_data || [];
        charts.updateSubjectChart(subjectData);
        ui.updateSubjectList(subjectData);

        // 시간대별 패턴
        charts.updatePatternChart(data.hourly_data);

        // 인사이트
        ui.updateInsights(data);

        // 최근 활동
        ui.updateRecentActivity(data);
    }

    // ===========================
    // 이벤트 리스너
    // ===========================
    function setupEventListeners() {
        // 학기 변경
        elements.semesterSelect.addEventListener('change', async (e) => {
            const semesterId = parseInt(e.target.value);
            state.currentSemester = state.allSemesters.find(s => s.id === semesterId);
            await loadSubjects();
            await loadStudyData();
        });

        // 새로고침
        elements.refreshBtn.addEventListener('click', async () => {
            elements.refreshBtn.querySelector('i').style.animation = 'spin 1s linear';
            await loadStudyData();
            setTimeout(() => {
                elements.refreshBtn.querySelector('i').style.animation = '';
            }, 1000);
        });

        // 기간 선택
        elements.periodBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                elements.periodBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentPeriod = btn.dataset.period;
                state.currentDate = new Date(); // 오늘로 리셋
                await loadStudyData();
            });
        });

        // 날짜 네비게이션
        elements.prevDateBtn.addEventListener('click', async () => {
            if (state.currentPeriod === 'daily') {
                state.currentDate.setDate(state.currentDate.getDate() - 1);
            } else if (state.currentPeriod === 'weekly') {
                state.currentDate.setDate(state.currentDate.getDate() - 7);
            } else if (state.currentPeriod === 'monthly') {
                state.currentDate.setMonth(state.currentDate.getMonth() - 1);
            }
            await loadStudyData();
        });

        elements.nextDateBtn.addEventListener('click', async () => {
            if (state.currentPeriod === 'daily') {
                state.currentDate.setDate(state.currentDate.getDate() + 1);
            } else if (state.currentPeriod === 'weekly') {
                state.currentDate.setDate(state.currentDate.getDate() + 7);
            } else if (state.currentPeriod === 'monthly') {
                state.currentDate.setMonth(state.currentDate.getMonth() + 1);
            }
            await loadStudyData();
        });

        elements.todayBtn.addEventListener('click', async () => {
            state.currentDate = new Date();
            await loadStudyData();
        });

        // 뷰 토글
        elements.viewToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                elements.viewToggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const view = btn.dataset.view;
                if (view === 'chart') {
                    elements.subjectChartView.style.display = 'block';
                    elements.subjectListView.style.display = 'none';
                } else {
                    elements.subjectChartView.style.display = 'none';
                    elements.subjectListView.style.display = 'block';
                }
            });
        });

        // 타이머
        elements.startBtn.addEventListener('click', () => timer.start());

        elements.pauseBtn.addEventListener('click', () => {
            if (state.timer.isPaused) {
                timer.resume();
            } else {
                timer.pause();
            }
        });

        elements.stopBtn.addEventListener('click', () => timer.stop());

        // 목표 저장
        elements.saveGoalBtn.addEventListener('click', () => {
            const goal = parseFloat(elements.dailyGoalInput.value);
            if (goal > 0 && goal <= 24) {
                state.dailyGoal = goal;
                utils.saveGoal(goal);
                utils.showNotification('목표가 저장되었습니다.', 'success');

                // 목표 달성률 재계산
                if (state.studyData && state.currentPeriod === 'daily') {
                    const totalSeconds = state.studyData.total_time || 0;
                    const goalSeconds = state.dailyGoal * 3600;
                    const progress = Math.min(100, (totalSeconds / goalSeconds) * 100);
                    elements.goalProgress.textContent = `${Math.round(progress)}%`;
                    ui.updateGoalRing(progress);
                }
            } else {
                utils.showNotification('목표는 0~24시간 사이로 설정해주세요.', 'warning');
            }
        });
    }

    // ===========================
    // 초기화
    // ===========================
    async function init() {
        // 목표 로드
        state.dailyGoal = utils.loadGoal();
        elements.dailyGoalInput.value = state.dailyGoal;

        // 이벤트 리스너 설정
        setupEventListeners();

        // 타이머 UI 초기화
        timer.updateDisplay();
        timer.updateCircle();
        timer.updateUI();
        timer.updateInterval();

        utils.showLoading(true);

        try {
            // 학기 로드
            await loadSemesters();

            // 과목 로드
            if (state.currentSemester) {
                await loadSubjects();

                // 학습 데이터 로드
                await loadStudyData();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            utils.showNotification('초기화 중 오류가 발생했습니다.', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    // ===========================
    // CSS 애니메이션 추가
    // ===========================
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // ===========================
    // DOMContentLoaded
    // ===========================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
