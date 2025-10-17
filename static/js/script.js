// 전역 변수
let timerInterval = null;
let shuttleUpdateInterval = null; // 셔틀버스 실시간 업데이트 인터벌
let timerSeconds = 0;
let isTimerRunning = false;
let todayStudyTime = 0; // DB에서 불러온 오늘의 총 공부 시간 (초)
// let weeklyStudyTimes = [0, 0, 0, 0, 0, 0, 0]; // (삭제) DB에서 직접 계산함

// (수정) Request 4: 현재 메모/Todo 객체
let currentMemoData = { day: 0, period: 0, memo: { note: '', todos: [] } };
let currentTimetableItem = null; // (신규) 현재 선택된 시간표 항목 전체

// (삭제) 임시 데이터 (API를 통해 가져옴)
// const SCHEDULE_DATA_DATA = [ ... ];
// const TIMETABLE_DATA = [ ... ];

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // 현재 날짜 표시
    updateCurrentDate();
    
    // 데이터 로드 (API 비동기 호출)
    loadShuttleSchedule(); // 셔틀 (기존 유지)
    loadMealPlan('student'); // 식단 (기존 유지)
    
    // (수정) 로그인 상태일 때만 DB 데이터 로드 시도
    if (document.querySelector('.profile-widget .profile-header .profile-name')) {
        loadStudyStats();
        loadTodaySchedule();
        loadTimetable();
    }

    // 셔틀버스 실시간 업데이트 시작
    startRealTimeUpdates();
    
    // 이벤트 리스너 등록
    setupEventListeners();
}

// 현재 날짜 업데이트
function updateCurrentDate() {
    // (파일 기준일 2025/10/16 목요일로 고정)
    const now = new Date(2025, 9, 16); // 9 = 10월
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    };
    const dateString = now.toLocaleDateString('ko-KR', options);
    const elDate = document.getElementById('currentDate');
    if (elDate) elDate.textContent = dateString;
}

// 셔틀버스 위젯에 현재 시간 표시
function updateCurrentTimeDisplay() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const elTime = document.getElementById('currentTimeDisplay');
    if (elTime) elTime.textContent = `현재 시간: ${timeString}`;
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 타이머 버튼
    const startTimerBtn = document.getElementById('startTimer');
    const stopTimerBtn = document.getElementById('stopTimer');
    if (startTimerBtn) startTimerBtn.addEventListener('click', startTimer);
    if (stopTimerBtn) stopTimerBtn.addEventListener('click', stopTimer);
    
    // 식단 탭
    document.querySelectorAll('.meal-widget .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.meal-widget .tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            loadMealPlan(e.target.dataset.cafeteria);
        });
    });
    
    // 셔틀버스 탭
    document.querySelectorAll('.shuttle-widget .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.shuttle-widget .tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            // 필터 변경 후 실시간 업데이트 함수 호출하여 즉시 갱신
            updateRealTimeShuttle(); 
        });
    });
    
    // 모달 관련 이벤트 (memoModal, shuttleModal, mealModal 모두 포함)
    const allModals = document.querySelectorAll('.modal');
    allModals.forEach(modal => {
        // 모달 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });
        // 닫기 버튼 클릭 시 닫기 (클래스 'modal-close'를 가진 모든 버튼)
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        });
    });

    // (수정) Request 4: 메모/Todo 저장 버튼
    const btnSaveMemo = document.getElementById('saveMemoBtn');
    if(btnSaveMemo) btnSaveMemo.addEventListener('click', saveMemo);
    
    // (신규) Request 4: Todo 추가 버튼
    const btnAddTodo = document.getElementById('memoAddTodoBtn');
    if(btnAddTodo) btnAddTodo.addEventListener('click', addTodoItem);
    // (신규) Request 4: Todo 입력창에서 Enter 키로 추가
    const inputNewTodo = document.getElementById('memoNewTodoInput');
    if(inputNewTodo) inputNewTodo.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTodoItem();
        }
    });

    
    // --- 전체 보기 버튼 이벤트 리스너 (모달 열기) ---
    document.querySelectorAll('.full-view-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.target;
            if (target === 'shuttleModal') {
                openShuttleModal();
            } else if (target === 'mealModal') {
                openMealModal();
            }
        });
    });
    
    // 네비게이션 메뉴 클릭 (기존 유지)
    const loadingOverlay = document.getElementById('loadingOverlay');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const linkUrl = e.currentTarget.getAttribute('href');
            const dataUrl = e.currentTarget.dataset.url;
            
            // (수정) 로컬 링크(# 제외)는 preventDefault 하지 않음
            if (linkUrl && linkUrl !== '#' && !dataUrl) {
                // (기존) window.location.href = linkUrl;
                // -> 클릭 이벤트를 그대로 진행시킴 (페이지 이동)
                return; 
            }

            e.preventDefault(); // dataUrl 또는 # 링크일 때만 기본 동작 방지

            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');

            if (dataUrl) {
                if (loadingOverlay) {
                    loadingOverlay.classList.add('active');
                }
                setTimeout(() => {
                    window.open(dataUrl, '_blank');
                    if (loadingOverlay) {
                        loadingOverlay.classList.remove('active');
                    }
                }, 1500);
            }
        });
    });
}


// 타이머 시작/정지/업데이트 함수
function startTimer() {
    if (!isTimerRunning) {
        isTimerRunning = true;
        document.getElementById('startTimer').disabled = true;
        document.getElementById('stopTimer').disabled = false;
        
        timerInterval = setInterval(() => {
            timerSeconds++;
            updateTimerDisplay();
            updateTimerProgress();
        }, 1000);
    }
}

// (수정) 타이머 정지 (DB 저장 및 통계 새로고침)
function stopTimer() {
    if (isTimerRunning) {
        isTimerRunning = false;
        clearInterval(timerInterval);
        
        document.getElementById('startTimer').disabled = false;
        document.getElementById('stopTimer').disabled = true;
        
        // (수정) DB에 방금 측정한 시간(timerSeconds)을 저장 요청
        saveStudyTime(timerSeconds).then(() => {
            // 저장이 완료되면, 서버에서 최신 통계(오늘/주간)를 다시 불러와 UI 갱신
            loadStudyStats();
        });
        
        // (수정) todayStudyTime은 loadStudyStats가 갱신하도록 함
        // todayStudyTime += timerSeconds; 
        
        timerSeconds = 0; // 현재 타이머 리셋
        updateTimerDisplay();
        updateTimerProgress();
    }
}

function updateTimerDisplay() {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;
    
    const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const el = document.getElementById('timerDisplay');
    if(el) el.textContent = display;
}

function updateTimerProgress() {
    const maxSeconds = 14400; // 4시간
    const progress = Math.min((timerSeconds / maxSeconds) * 283, 283);
    const circle = document.getElementById('timerProgress');
    if (circle) circle.style.strokeDashoffset = 283 - progress;
}

// (삭제) updateStudyStats() - loadStudyStats()가 UI 갱신을 대신함

// (수정) saveStudyTime (DB에 "추가할 시간" 전송)
async function saveStudyTime(durationToAdd) {
    if (durationToAdd <= 0) return; // 저장할 시간이 없으면 종료

    const data = {
        duration_to_add: durationToAdd,
        date: new Date(2025, 9, 16).toISOString().split('T')[0] // 'YYYY-MM-DD' (파일 기준일)
    };

    try {
        const response = await fetch('/api/study-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error('Server error while saving study time');
        }
        console.log('Study time saved to server.');
    } catch (error) {
        console.error('Failed to save study time to server:', error);
        // (추가) 사용자에게 저장 실패 알림
        alert('공부 시간 저장에 실패했습니다. 네트워크 연결을 확인해주세요.');
    }
}

// (수정) loadStudyTime -> loadStudyStats (DB에서 통계 로드)
async function loadStudyStats() {
    try {
        const response = await fetch('/api/study-stats');
        if (!response.ok) {
            // 로그인이 안되어 401(Unauthorized) 등이 반환되면 여기로 옴
            throw new Error('Not logged in or server error');
        }
        const data = await response.json();
        
        // 전역 변수인 "오늘 총 공부 시간"을 DB 값으로 설정
        todayStudyTime = data.today; 
        
        // UI 갱신
        const todayHours = Math.floor(data.today / 3600);
        const todayMinutes = Math.floor((data.today % 3600) / 60);
        const todayEl = document.getElementById('todayTime');
        if (todayEl) todayEl.textContent = `${todayHours}h ${todayMinutes}m`;

        const avgHours = Math.floor(data.weekly_avg / 3600);
        const avgMinutes = Math.floor((data.weekly_avg % 3600) / 60);
        const weeklyEl = document.getElementById('weeklyAvg');
        if (weeklyEl) weeklyEl.textContent = `${avgHours}h ${avgMinutes}m`;
        
    } catch (error) {
        console.log('Could not load study stats (not logged in?):', error.message);
        // 비로그인 상태이므로 기본값(0h 0m) 유지
        const todayEl = document.getElementById('todayTime');
        if (todayEl) todayEl.textContent = `0h 0m`;
        const weeklyEl = document.getElementById('weeklyAvg');
        if (weeklyEl) weeklyEl.textContent = `0h 0m`;
    }
}


// --- 셔틀버스 함수 (기존과 동일) ---
function startRealTimeUpdates() {
    if (shuttleUpdateInterval) clearInterval(shuttleUpdateInterval);
    shuttleUpdateInterval = setInterval(() => {
        updateCurrentTimeDisplay();
        updateRealTimeShuttle();
    }, 1000);
}

async function loadShuttleSchedule() {
    try {
        const response = await fetch('/api/shuttle');
        const data = await response.json();
        window.shuttleData = data;
        updateRealTimeShuttle();
    } catch (error) {
        console.error('Failed to load shuttle schedule:', error);
        window.shuttleData = [];
        updateRealTimeShuttle();
    }
}

function updateRealTimeShuttle() {
    const container = document.getElementById('shuttleList');
    if (!container) return;
    const activeTab = document.querySelector('.shuttle-widget .tab.active');
    const currentFilter = activeTab ? activeTab.dataset.tab : 'all';
    
    let data = window.shuttleData || [];
    
    // (파일 기준 2025/10/16 목요일 기준, '평일' 데이터만 필터링)
    const TODAY_DATE = new Date(2025, 9, 16); 
    const todayDayOfWeek = TODAY_DATE.getDay();
    const dayType = todayDayOfWeek === 0 || todayDayOfWeek === 6 ? '일요일' : '평일';
    data = data.filter(s => s.type === dayType || s.type === '기타');
    
    data = data.filter(s => {
        switch (currentFilter) {
            case 'school_to_station':
                return s.route.includes('학교 → 조치원역');
            case 'station_to_school':
                return s.route.includes('조치원/오송역 → 학교') || s.route === '조치원역 → 학교';
            case 'osong':
                return s.route_group === 'Osong_Included';
            case 'all':
            default:
                return true;
        }
    });

    const now = new Date();
    // (파일 기준 시간으로 고정)
    const currentSecondsOfDay = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) % (24 * 3600);
    // (디버깅용 고정 시간)
    // const DEBUG_HOUR = 9;
    // const DEBUG_MINUTE = 0;
    // const currentSecondsOfDay = DEBUG_HOUR * 3600 + DEBUG_MINUTE * 60;


    let processedData = data
        .map(shuttle => {
            const [hour, minute] = shuttle.time.split(':').map(Number);
            shuttle.shuttleSecondsOfDay = hour * 3600 + minute * 60;
            shuttle.remainingTimeSeconds = shuttle.shuttleSecondsOfDay - currentSecondsOfDay;
            return shuttle;
        })
        .filter(shuttle => shuttle.remainingTimeSeconds > 0) 
        .sort((a, b) => a.shuttleSecondsOfDay - b.shuttleSecondsOfDay);

    container.innerHTML = '';
    
    if (processedData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">운행 예정인 시간표 정보가 없습니다.</p>';
        return;
    }
    
    processedData.forEach((shuttle, index) => {
        const remainingTimeSeconds = shuttle.remainingTimeSeconds;
        let statusText = '';
        let statusClass = 'scheduled';
        const isNextShuttle = (index < 2); 

        if (remainingTimeSeconds <= 300) { 
            const remainingMins = Math.floor(remainingTimeSeconds / 60);
            const remainingSecs = remainingTimeSeconds % 60;
            statusText = `도착까지 ${String(remainingMins).padStart(2, '0')}분 ${String(remainingSecs).padStart(2, '0')}초`;
            statusClass = 'active blinking';
        } else {
            const remainingHours = Math.floor(remainingTimeSeconds / 3600);
            const remainingMins = Math.floor((remainingTimeSeconds % 3600) / 60);
            let minDisplay = (remainingHours > 0) ? `${remainingHours}시간 ${remainingMins}분` : `${remainingMins}분 남음`;
            statusText = `도착까지 ${minDisplay}`;
            statusClass = 'scheduled'; 
        }
        
        const item = document.createElement('div');
        item.className = 'shuttle-item';
        if (isNextShuttle) {
             item.classList.add('next-shuttle');
        }
        
        item.innerHTML = `
            <div class="shuttle-time">${shuttle.time}</div>
            <div class="shuttle-route">${shuttle.route}</div>
            <div class="shuttle-status ${statusClass}">${statusText}</div>
        `;
        container.appendChild(item);
    });
}

function openShuttleModal() {
    const modal = document.getElementById('shuttleModal');
    const container = modal.querySelector('.shuttle-full-table-container');
    if (!window.shuttleData) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">시간표 데이터를 로드 중입니다...</p>';
        loadShuttleSchedule().then(() => renderFullShuttleTable(container));
    } else {
        renderFullShuttleTable(container);
    }
    modal.classList.add('active');
}

function renderFullShuttleTable(container) {
    let data = window.shuttleData || [];
    if (data.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">시간표 정보가 없습니다.</p>';
        return;
    }
    const groupedData = data.reduce((acc, shuttle) => {
        acc[shuttle.type] = acc[shuttle.type] || {};
        const groupKey = shuttle.route_group === 'Osong_Included' ? 'Osong' : 'Jochiwon';
        acc[shuttle.type][groupKey] = acc[shuttle.type][groupKey] || [];
        acc[shuttle.type][groupKey].push(shuttle);
        return acc;
    }, {});
    for (const day in groupedData) {
        for (const routeGroup in groupedData[day]) {
            groupedData[day][routeGroup].sort((a, b) => a.time.localeCompare(b.time));
        }
    }
    let html = '';
    const dayOrder = ['평일', '일요일'];
    const routeOrder = ['Jochiwon', 'Osong'];
    dayOrder.forEach(dayType => {
        if (groupedData[dayType]) {
            routeOrder.forEach(routeGroup => {
                const shuttles = groupedData[dayType][routeGroup];
                if (shuttles && shuttles.length > 0) {
                    const groupName = routeGroup === 'Jochiwon' ? '조치원역 ↔ 학교 노선' : '오송역 포함 노선';
                    html += `<span class="shuttle-group-header">${dayType} - ${groupName}</span>`;
                    html += `<table class="shuttle-full-table">
                        <thead><tr><th>출발 시각</th><th>노선 구분</th><th>비고</th></tr></thead><tbody>`;
                    shuttles.forEach(shuttle => {
                        html += `
                            <tr>
                                <td>${shuttle.time}</td>
                                <td>${shuttle.route}</td>
                                <td>${shuttle.note}</td>
                            </tr>
                        `;
                    });
                    html += '</tbody></table>';
                }
            });
        }
    });
    container.innerHTML = html || '<p style="text-align: center; padding: 20px;">시간표 정보가 없습니다.</p>';
}

// --- 식단 함수 (기존과 동일) ---
async function loadMealPlan(cafeteria) {
    try {
        const response = await fetch(`/api/meal?cafeteria=${cafeteria}`);
        const data = await response.json();
        
        const studentLunchContainer = document.getElementById('studentLunchContainer');
        const facultyLunchContainer = document.getElementById('facultyLunchContainer');
        const lunchFaculty = document.getElementById('lunch-faculty');
        
        document.getElementById('breakfast').textContent = data.breakfast || '식단 정보 없음';
        document.getElementById('dinner').textContent = data.dinner || '식단 정보 없음';

        if (cafeteria === 'student') {
            if (studentLunchContainer) studentLunchContainer.style.display = 'block'; 
            if (facultyLunchContainer) facultyLunchContainer.style.display = 'none';
            if (typeof data.lunch === 'object') {
                document.getElementById('lunch-korean').textContent = data.lunch.korean || '식단 정보 없음';
                document.getElementById('lunch-ala_carte').textContent = data.lunch.ala_carte || '식단 정보 없음';
                document.getElementById('lunch-snack_plus').textContent = data.lunch.snack_plus || '식단 정보 없음';
            } else {
                document.getElementById('lunch-korean').textContent = '데이터 오류';
                document.getElementById('lunch-ala_carte').textContent = '데이터 오류';
                document.getElementById('lunch-snack_plus').textContent = '데이터 오류';
            }
        } else if (cafeteria === 'faculty') {
            if (studentLunchContainer) studentLunchContainer.style.display = 'none';
            if (facultyLunchContainer) facultyLunchContainer.style.display = 'block';
            if (lunchFaculty) lunchFaculty.textContent = data.lunch || '식단 정보 없음';
        }
    } catch (error) {
        console.error('Failed to load meal plan:', error);
        document.getElementById('breakfast').textContent = '데이터 로드 실패';
        document.getElementById('dinner').textContent = '데이터 로드 실패';
        if (document.getElementById('lunch-korean')) document.getElementById('lunch-korean').textContent = '데이터 로드 실패';
        if (document.getElementById('lunch-ala_carte')) document.getElementById('lunch-ala_carte').textContent = '데이터 로드 실패';
        if (document.getElementById('lunch-snack_plus')) document.getElementById('lunch-snack_plus').textContent = '데이터 로드 실패';
        if (document.getElementById('lunch-faculty')) document.getElementById('lunch-faculty').textContent = '데이터 로드 실패';
    }
}

async function openMealModal() {
    const modal = document.getElementById('mealModal');
    const container = modal.querySelector('.meal-full-table-container');
    container.innerHTML = '<p style="text-align: center; padding: 20px;">주간 식단표를 불러오는 중입니다...</p>';
    modal.classList.add('active');
    try {
        const response = await fetch('/api/meal/week');
        const data = await response.json();
        renderWeeklyMealTable(container, data);
    } catch (error) {
        console.error('Failed to load weekly meal plan:', error);
        container.innerHTML = '<p style="text-align: center; color: var(--color-danger); padding: 20px;">주간 식단 데이터를 로드하는 데 실패했습니다.</p>';
    }
}

function renderWeeklyMealTable(container, data) {
    if (!data.식단 || Object.keys(data.식단).length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">이번 주 식단 정보가 없습니다.</p>';
        return;
    }
    const studentMenu = data.식단.student || {};
    const dates = Object.keys(studentMenu)
        .filter(dateKey => !dateKey.includes('(토)') && !dateKey.includes('(일)'))
        .sort();
    if (dates.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">이번 주(평일) 식단 정보가 없습니다.</p>';
        return;
    }
    let html = '<table class="meal-full-table"><thead><tr><th style="min-width: 120px;">구분</th>';
    dates.forEach(date => {
        html += `<th>${date}</th>`;
    });
    html += '</tr></thead><tbody>';
    const student = data.식단.student;
    const faculty = data.식단.faculty;
    if (student) {
        html += `<tr><td class="meal-type-cell">학생 식당 - 조식</td>`;
        dates.forEach(date => {
            html += `<td>${student[date].breakfast || '정보 없음'}</td>`;
        });
        html += `</tr>`;
        const studentLunchMenus = [
            { id: 'korean', name: '한식' },
            { id: 'ala_carte', name: '일품/분식' },
            { id: 'snack_plus', name: 'Plus' }
        ];
        studentLunchMenus.forEach((meal, index) => {
            html += `<tr>`;
            if (index === 0) {
                html += `<td class="meal-type-cell" rowspan="3">학생 식당 - 중식</td>`;
            }
            dates.forEach(date => {
                const dailyLunch = student[date].lunch;
                const menuText = typeof dailyLunch === 'object' ? dailyLunch[meal.id] : (dailyLunch || '정보 없음');
                html += `<td><span class="meal-category-title">${meal.name}</span><div class="meal-menu-text">${menuText}</div></td>`;
            });
            html += `</tr>`;
        });
        html += `<tr><td class="meal-type-cell">학생 식당 - 석식</td>`;
        dates.forEach(date => {
            html += `<td>${student[date].dinner || '정보 없음'}</td>`;
        });
        html += `</tr>`;
    }
    if (faculty) {
        html += `<tr><td class="meal-type-cell">교직원 식당 - 중식</td>`;
        dates.forEach(date => {
            html += `<td>${faculty[date].lunch || '정보 없음'}</td>`;
        });
        html += `</tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

// --- (수정) 일정/시간표/메모 함수 (DB 연동) ---

// (수정) 오늘의 일정 로드 (API 호출)
async function loadTodaySchedule() {
    const container = document.getElementById('scheduleList');
    if (!container) return;
    
    try {
        const response = await fetch('/api/schedule'); // DB 데이터 요청
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        displaySchedule(data);
    } catch (error) {
        console.error('Failed to load schedule:', error);
        if (container) container.innerHTML = '<p style="text-align: center; color: var(--color-danger); padding: 20px;">일정 로드 실패</p>';
    }
}

function displaySchedule(data) {
    const container = document.getElementById('scheduleList');
    if (!container) return;
    container.innerHTML = '';
    
    if (data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">오늘 일정이 없습니다.</p>';
        return;
    }
    
    data.forEach(schedule => {
        const item = document.createElement('div');
        item.className = 'schedule-item';
        item.innerHTML = `
            <div class="schedule-time">${schedule.time}</div>
            <div class="schedule-content">
                <div class="schedule-title">${schedule.title}</div>
                <div class="schedule-location"><i class="fas fa-map-marker-alt"></i> ${schedule.location}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// (수정) 시간표 로드 (API 호출)
async function loadTimetable() {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    
    try {
        const response = await fetch('/api/timetable'); // DB 데이터 요청
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        // (수정) API가 객체를 반환하므로 JSON.parse 필요 없음
        window.timetableData = data; 
        displayTimetable(data);
        
    } catch (error) {
        console.error('Failed to load timetable:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-danger); padding: 20px;">시간표 로드 실패</td></tr>';
    }
}

function displayTimetable(data) {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const periods = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30'];
    
    // (수정) DB에서 받은 데이터를 맵으로 변환
    const timetableMap = (data || []).reduce((map, item) => {
        map[`${item.day}-${item.period}`] = item;
        return map;
    }, {});
    
    for (let period = 1; period <= 6; period++) {
        const row = document.createElement('tr');
        
        const timeCell = document.createElement('td');
        timeCell.textContent = periods[period - 1];
        timeCell.style.fontWeight = '600';
        timeCell.style.background = 'var(--bg-primary)';
        row.appendChild(timeCell);
        
        for (let day = 1; day <= 5; day++) {
            const cell = document.createElement('td');
            const key = `${day}-${period}`;
            const item = timetableMap[key];
            
            // (수정) Request 4: 메모/Todo 뱃지 표시
            let memoIcon = '';
            let todoBadge = '';
            
            if (item && item.memo) {
                const memo = item.memo; // 이제 memo는 객체
                if (memo.note) {
                    memoIcon = '<i class="fas fa-sticky-note timetable-memo-icon"></i>';
                }
                if (memo.todos && memo.todos.length > 0) {
                    const pendingTodos = memo.todos.filter(t => !t.done).length;
                    if (pendingTodos > 0) {
                        todoBadge = `<span class="timetable-todo-badge">${pendingTodos}</span>`;
                    }
                }
            }

            if (item && item.subject) {
                // 과목이 있는 셀
                const cellDiv = document.createElement('div');
                cellDiv.className = 'timetable-cell';
                cellDiv.innerHTML = `
                    <div class="timetable-badges">
                        ${memoIcon}
                        ${todoBadge}
                    </div>
                    <div class="timetable-subject">${item.subject || '과목 없음'}</div>
                    <div class="timetable-professor">${item.professor || '-'}</div>
                    <div class="timetable-room">${item.room || '-'}</div>
                `;
                cellDiv.addEventListener('click', () => openMemoModal(day, period, item));
                cell.appendChild(cellDiv);
            } else if (item) {
                // 과목은 없지만 메모/Todo만 있는 셀 (예: 빈 공강)
                const cellDiv = document.createElement('div');
                cellDiv.className = 'timetable-cell empty'; // (신규) 빈 셀 스타일
                 cellDiv.innerHTML = `
                    <div class="timetable-badges">
                        ${memoIcon}
                        ${todoBadge}
                    </div>
                `;
                cellDiv.addEventListener('click', () => openMemoModal(day, period, item));
                cell.appendChild(cellDiv);
            } else {
                 // (신규) 완전히 비어있는 셀 (메모/Todo 추가 가능)
                const cellDiv = document.createElement('div');
                cellDiv.className = 'timetable-cell empty add-new';
                 cellDiv.innerHTML = `<i class="fas fa-plus"></i>`;
                // (수정) 새 항목을 위한 openMemoModal 호출 (item이 null)
                cellDiv.addEventListener('click', () => openMemoModal(day, period, null));
                cell.appendChild(cellDiv);
            }
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
}

// (수정) Request 4: 메모 & Todo 모달 열기
function openMemoModal(day, period, item) {
    // (신규) item이 null이면 (빈 셀 클릭) 기본 객체 생성
    if (!item) {
        item = {
            day: day,
            period: period,
            subject: '공강 시간',
            professor: '-',
            room: '-',
            memo: { note: '', todos: [] }
        };
    }

    // (수정) 전역 변수에 현재 아이템 정보 저장
    currentTimetableItem = item;
    
    // (수정) memo가 객체인지 확인 (오래된 데이터 호환성)
    let memoObj;
    if (typeof item.memo === 'object' && item.memo !== null) {
        memoObj = item.memo;
    } else if (typeof item.memo === 'string') {
        // (신규) 만약 DB에 아직 JSON이 아닌 텍스트가 있다면
        memoObj = { note: item.memo, todos: [] };
    } else {
        memoObj = { note: '', todos: [] };
    }

    // (신규) 모달에 과목 정보 표시
    document.getElementById('memoSubjectName').textContent = item.subject || '메모/Todo';
    document.getElementById('memoSubjectProfessor').textContent = item.professor || '-';
    document.getElementById('memoSubjectRoom').textContent = item.room || '-';

    // (수정) 모달에 메모와 Todo 리스트 채우기
    document.getElementById('memoText').value = memoObj.note || '';
    renderTodoList(memoObj.todos || []);
    
    document.getElementById('memoModal').classList.add('active');
}

// (신규) Request 4: Todo 리스트를 렌더링하는 함수
function renderTodoList(todos) {
    const todoListUl = document.getElementById('memoTodoList');
    todoListUl.innerHTML = '';
    
    if (!todos || todos.length === 0) {
        todoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
        return;
    }
    
    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = todo.done ? 'todo-item done' : 'todo-item';
        
        li.innerHTML = `
            <input type="checkbox" id="todo-${index}" ${todo.done ? 'checked' : ''}>
            <label for="todo-${index}" class="todo-label">${todo.task}</label>
            <span class="todo-delete-btn" data-index="${index}">&times;</span>
        `;
        
        // (신규) 체크박스 변경 시 이벤트
        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            todo.done = e.target.checked;
            li.classList.toggle('done', e.target.checked);
        });
        
        // (신규) 삭제 버튼 클릭 시 이벤트
        li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            todos.splice(indexToRemove, 1); // 배열에서 삭제
            renderTodoList(todos); // 목록 새로고침
        });
        
        todoListUl.appendChild(li);
    });
}

// (신규) Request 4: Todo 추가 버튼 클릭
function addTodoItem() {
    const input = document.getElementById('memoNewTodoInput');
    const taskText = input.value.trim();
    
    if (taskText === '') return;
    
    const newTodo = { task: taskText, done: false };
    
    // 현재 UI에 반영
    const todoListUl = document.getElementById('memoTodoList');
    
    // '할 일이 없습니다' 메시지 제거
    const emptyMsg = todoListUl.querySelector('.todo-empty');
    if (emptyMsg) {
        todoListUl.innerHTML = '';
    }
    
    // (임시) 현재 아이템의 memo 객체에 접근하여 todos 배열 가져오기
    let todos;
    if (currentTimetableItem && currentTimetableItem.memo && currentTimetableItem.memo.todos) {
         todos = currentTimetableItem.memo.todos;
    } else if (currentTimetableItem && currentTimetableItem.memo) {
         currentTimetableItem.memo.todos = [];
         todos = currentTimetableItem.memo.todos;
    } else if (currentTimetableItem) {
        currentTimetableItem.memo = { note: '', todos: [] };
        todos = currentTimetableItem.memo.todos;
    } else {
        // 비상시 (이론상 openMemoModal에서 item이 생성되어야 함)
        todos = []; 
    }
    
    todos.push(newTodo);
    renderTodoList(todos); // 목록 새로고침
    
    input.value = '';
    input.focus();
}


function closeModal() {
    document.getElementById('memoModal').classList.remove('active');
}

// (수정) Request 4: 메모/Todo 저장 (API 호출)
async function saveMemo() {
    const memoText = document.getElementById('memoText').value;
    
    // (신규) UI에서 Todo 리스트 읽어오기
    const todoListUl = document.getElementById('memoTodoList');
    const todos = [];
    todoListUl.querySelectorAll('.todo-item').forEach(li => {
        const label = li.querySelector('.todo-label');
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (label && checkbox) {
            todos.push({
                task: label.textContent,
                done: checkbox.checked
            });
        }
    });
    
    // (신규) 저장할 메모 객체 생성
    const memoData = {
        note: memoText,
        todos: todos
    };

    // 전역 변수에서 현재 아이템(day, period) 찾기
    const item = currentTimetableItem; 
    
    if (item) {
        const originalMemo = item.memo; // (신규) 롤백 대비
        item.memo = memoData; // 1. UI 즉시 업데이트 (Optimistic Update)
        
        try {
            // 2. 서버(DB)에 저장 요청
            const response = await fetch('/api/timetable/memo', { // (수정) API 엔드포인트
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    day: item.day,
                    period: item.period,
                    memo: memoData // (수정) 객체를 그대로 전송
                }),
            });
            
            const result = await response.json();
            if (result.status !== 'success') {
                throw new Error(result.message || 'Failed to save memo');
            }
            console.log('Memo/Todo saved successfully to server');
            
        } catch (error) {
            console.error('Failed to save memo to server:', error);
            alert('메모 저장에 실패했습니다.');
            // (실패 시 롤백)
            item.memo = originalMemo; 
        }
        
        // 3. UI 다시 렌더링 (메모/Todo 뱃지 등 반영)
        displayTimetable(window.timetableData); 
    }
    
    closeModal();
}