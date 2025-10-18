// 전역 변수
let timerInterval = null;
let shuttleUpdateInterval = null; // 셔틀버스 실시간 업데이트 인터벌
let timerSeconds = 0;
let isTimerRunning = false;
let todayStudyTime = 0; // DB에서 불러온 오늘의 총 공부 시간 (초)

let currentTimetableItem = null; // 현재 선택된 'Subject' 객체

let windowTimetableData = []; // 전역 시간표 데이터 (Subject 배열)

// [NEW] 과목별 색상 팔레트 (timetable_management.js와 동일하게 유지)
const subjectColors = [
    'rgba(239, 83, 80, 0.1)',   // Red
    'rgba(236, 64, 122, 0.1)',  // Pink
    'rgba(171, 71, 188, 0.1)',  // Purple
    'rgba(126, 87, 194, 0.1)',  // Deep Purple
    'rgba(92, 107, 192, 0.1)',  // Indigo
    'rgba(66, 165, 245, 0.1)',  // Blue
    'rgba(41, 182, 246, 0.1)',  // Light Blue
    'rgba(38, 198, 218, 0.1)',  // Cyan
    'rgba(38, 166, 154, 0.1)',  // Teal
    'rgba(102, 187, 106, 0.1)', // Green
    'rgba(255, 167, 38, 0.1)', // Orange
    'rgba(141, 110, 99, 0.1)'   // Brown
];
let subjectColorMap = {}; // 과목 ID -> 색상 매핑

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

    // 로그인 상태일 때만 DB 데이터 로드 시도
    if (document.querySelector('.profile-widget .profile-header .profile-name')) {
        loadStudyStats();
        loadTodaySchedule();
        loadTimetable(); // 새 로직으로 실행
    }

    // 셔틀버스 실시간 업데이트 시작
    startRealTimeUpdates();

    // 이벤트 리스너 등록
    setupEventListeners();
}

// 현재 날짜 업데이트
function updateCurrentDate() {
    const now = new Date();
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
            updateRealTimeShuttle();
        });
    });

    // 모달 관련 이벤트
    const allModals = document.querySelectorAll('.modal');
    allModals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        });
    });

    // 메모/Todo 저장 버튼 (메모 모달이 홈 화면에도 있으므로 유지)
    const btnSaveMemo = document.getElementById('saveMemoBtn');
    if(btnSaveMemo) btnSaveMemo.addEventListener('click', saveMemo); // saveMemo 함수는 아래에 정의됨

    // Todo 추가 버튼 (메모 모달이 홈 화면에도 있으므로 유지)
    const btnAddTodo = document.getElementById('memoAddTodoBtn');
    if(btnAddTodo) btnAddTodo.addEventListener('click', addTodoItem); // addTodoItem 함수는 아래에 정의됨
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

    // 네비게이션 메뉴 클릭
    const loadingOverlay = document.getElementById('loadingOverlay');
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const linkUrl = e.currentTarget.getAttribute('href');
            const dataUrl = e.currentTarget.dataset.url;

            if (linkUrl && linkUrl !== '#' && !dataUrl) {
                return;
            }
            e.preventDefault();

            if (linkUrl && linkUrl !== '#') {
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                e.currentTarget.classList.add('active');
            }

            if (dataUrl) {
                if (loadingOverlay) loadingOverlay.classList.add('active');
                setTimeout(() => {
                    window.open(dataUrl, '_blank');
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
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

function stopTimer() {
    if (isTimerRunning) {
        isTimerRunning = false;
        clearInterval(timerInterval);

        document.getElementById('startTimer').disabled = false;
        document.getElementById('stopTimer').disabled = true;

        saveStudyTime(timerSeconds).then(() => {
            loadStudyStats();
        });

        timerSeconds = 0;
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

async function saveStudyTime(durationToAdd) {
    if (durationToAdd <= 0) return;
    const data = {
        duration_to_add: durationToAdd,
        date: new Date().toISOString().split('T')[0]
    };
    try {
        const response = await fetch('/api/study-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Server error');
    } catch (error) {
        console.error('Failed to save study time:', error);
        alert('공부 시간 저장에 실패했습니다.');
    }
}

async function loadStudyStats() {
    try {
        const response = await fetch('/api/study-stats');
        if (!response.ok) throw new Error('Not logged in or server error');
        const data = await response.json();

        todayStudyTime = data.today;

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

    const TODAY_DATE = new Date();
    const todayDayOfWeek = TODAY_DATE.getDay();
    // 수정: 토요일도 평일 시간표 적용 (단, CSV에 토요일 시간표가 따로 없다면)
    const dayType = (todayDayOfWeek === 0) ? '일요일' : '평일';

    data = data.filter(s => s.type === dayType || s.type === '기타');

    data = data.filter(s => {
        switch (currentFilter) {
            case 'school_to_station': return s.route.includes('학교 → 조치원역');
            case 'station_to_school': return s.route.includes('조치원/오송역 → 학교') || s.route === '조치원역 → 학교';
            case 'osong': return s.route_group === 'Osong_Included';
            case 'all': default: return true;
        }
    });

    const now = new Date();
    const currentSecondsOfDay = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());

    let processedData = data
        .map(shuttle => {
            const [hour, minute] = shuttle.time.split(':').map(Number);
            shuttle.shuttleSecondsOfDay = hour * 3600 + minute * 60;
            shuttle.remainingTimeSeconds = shuttle.shuttleSecondsOfDay - currentSecondsOfDay;
            return shuttle;
        })
        .filter(shuttle => shuttle.remainingTimeSeconds > -600) // 운행 종료 10분 후까지 표시
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
        const isNextShuttle = (index === 0 && remainingTimeSeconds > 0) || (index === 1 && remainingTimeSeconds > 0 && processedData[0].remainingTimeSeconds <= 0); // 다음 또는 다다음 출발 예정 셔틀

        if (remainingTimeSeconds <= 0) {
            statusText = '운행 완료';
            statusClass = 'completed';
        } else if (remainingTimeSeconds <= 300) { // 5분 이내
            const remainingMins = Math.floor(remainingTimeSeconds / 60);
            const remainingSecs = remainingTimeSeconds % 60;
            statusText = `곧 도착 (${String(remainingMins).padStart(2, '0')}분 ${String(remainingSecs).padStart(2, '0')}초)`;
            statusClass = 'active blinking';
        } else { // 5분 초과
            const remainingHours = Math.floor(remainingTimeSeconds / 3600);
            const remainingMins = Math.floor((remainingTimeSeconds % 3600) / 60);
            let minDisplay = (remainingHours > 0) ? `${remainingHours}시간 ${remainingMins}분 후` : `${remainingMins}분 후`;
            statusText = `출발 예정 (${minDisplay})`;
            statusClass = 'scheduled';
            if (isNextShuttle) {
                 statusClass = 'active'; // 다음 셔틀 강조 (녹색 배경)
            }
        }

        const item = document.createElement('div');
        item.className = 'shuttle-item';
        // 'next-shuttle' 클래스 추가 조건 수정: 다음 또는 다다음 출발 예정인 경우
         if (isNextShuttle && remainingTimeSeconds > 0) {
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
        container.innerHTML = '<p>시간표 데이터를 로드 중입니다...</p>';
        loadShuttleSchedule().then(() => renderFullShuttleTable(container));
    } else {
        renderFullShuttleTable(container);
    }
    modal.classList.add('active');
}

function renderFullShuttleTable(container) {
    let data = window.shuttleData || [];
    if (data.length === 0) {
        container.innerHTML = '<p>시간표 정보가 없습니다.</p>';
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
    const dayOrder = ['평일', '일요일']; // 토요일은 평일에 포함될 수 있음
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
                                <td>${shuttle.note || '-'}</td>
                            </tr>
                        `;
                    });
                    html += '</tbody></table>';
                }
            });
        }
    });
    container.innerHTML = html || '<p>시간표 정보가 없습니다.</p>';
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
        // 오류 UI 처리
        document.getElementById('breakfast').textContent = '로드 실패';
        document.getElementById('lunch-korean').textContent = '로드 실패';
        document.getElementById('lunch-ala_carte').textContent = '로드 실패';
        document.getElementById('lunch-snack_plus').textContent = '로드 실패';
        document.getElementById('lunch-faculty').textContent = '로드 실패';
        document.getElementById('dinner').textContent = '로드 실패';
    }
}


async function openMealModal() {
    const modal = document.getElementById('mealModal');
    const container = modal.querySelector('.meal-full-table-container');
    container.innerHTML = '<p>주간 식단표를 불러오는 중입니다...</p>';
    modal.classList.add('active');
    try {
        const response = await fetch('/api/meal/week');
        const data = await response.json();
        renderWeeklyMealTable(container, data);
    } catch (error) {
        console.error('Failed to load weekly meal plan:', error);
        container.innerHTML = '<p>주간 식단 데이터를 로드하는 데 실패했습니다.</p>';
    }
}

function renderWeeklyMealTable(container, data) {
    if (!data.식단 || Object.keys(data.식단).length === 0) {
        container.innerHTML = '<p>이번 주 식단 정보가 없습니다.</p>';
        return;
    }
    const studentMenu = data.식단.student || {};
    // 모든 날짜 키 가져오기 (토, 일 포함 가능성 있음)
    const allDates = Object.keys(studentMenu)
        .sort((a, b) => { // 날짜순 정렬 (월.일 형식 가정)
            const [aMonth, aDay] = a.split('(')[0].split('.').map(Number);
            const [bMonth, bDay] = b.split('(')[0].split('.').map(Number);
            if (aMonth !== bMonth) return aMonth - bMonth;
            return aDay - bDay;
        });

    if (allDates.length === 0) {
        container.innerHTML = '<p>이번 주 식단 정보가 없습니다.</p>';
        return;
    }
    let html = `<p style="text-align:center; font-weight: bold; margin-bottom: 10px;">${data.기간.시작일} ~ ${data.기간.종료일}</p>`;
    html += '<table class="meal-full-table"><thead><tr><th style="min-width: 120px;">구분</th>';
    allDates.forEach(date => { html += `<th>${date}</th>`; });
    html += '</tr></thead><tbody>';

    const student = data.식단.student;
    const faculty = data.식단.faculty;

    // 조식 (학생)
    if (student) {
        html += `<tr><td class="meal-type-cell">학생 - 조식</td>`;
        allDates.forEach(date => { html += `<td>${student[date] ? student[date].breakfast : '-'}</td>`; });
        html += `</tr>`;

        // 중식 (학생 - 한식, 일품/분식, Plus)
        const studentLunchMenus = [
            { id: 'korean', name: '한식' },
            { id: 'ala_carte', name: '일품/분식' },
            { id: 'snack_plus', name: 'Plus' }
        ];
        studentLunchMenus.forEach((meal, index) => {
            html += `<tr>`;
            if (index === 0) html += `<td class="meal-type-cell" rowspan="3">학생 - 중식</td>`;
            allDates.forEach(date => {
                const dailyLunch = student[date] ? student[date].lunch : null;
                const menuText = (dailyLunch && typeof dailyLunch === 'object') ? dailyLunch[meal.id] : (dailyLunch || '-');
                html += `<td><span class="meal-category-title">${meal.name}</span><div class="meal-menu-text">${menuText}</div></td>`;
            });
            html += `</tr>`;
        });

        // 석식 (학생)
        html += `<tr><td class="meal-type-cell">학생 - 석식</td>`;
        allDates.forEach(date => { html += `<td>${student[date] ? student[date].dinner : '-'}</td>`; });
        html += `</tr>`;
    }

    // 중식 (교직원)
    if (faculty) {
        html += `<tr><td class="meal-type-cell">교직원 - 중식</td>`;
        allDates.forEach(date => { html += `<td>${faculty[date] ? faculty[date].lunch : '-'}</td>`; });
        html += `</tr>`;
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}


// --- 일정 함수 (기존과 동일) ---

async function loadTodaySchedule() {
    const container = document.getElementById('scheduleList');
    if (!container) return;
    try {
        const response = await fetch('/api/schedule');
        if (!response.ok) { // 401 Unauthorized 등 처리
             if (response.status === 401) {
                container.innerHTML = ''; // 로그인 안되어 있으면 내용 비우기 (오버레이가 이미 있음)
             } else {
                 throw new Error(`Network response was not ok (${response.status})`);
             }
             return;
        }
        const data = await response.json();
        displaySchedule(data);
    } catch (error) {
        console.error('Failed to load schedule:', error);
        // 로그인 상태인데 로드 실패한 경우 에러 메시지 표시
        if (document.querySelector('.profile-widget .profile-header .profile-name')) {
             if (container) container.innerHTML = '<p style="text-align: center; color: var(--color-danger); padding: 20px;">일정 로드 실패</p>';
        } else {
             if (container) container.innerHTML = ''; // 비로그인이면 비우기
        }
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
                <div class="schedule-location"><i class="fas fa-map-marker-alt"></i> ${schedule.location || ''}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// --- 시간표/메모 함수 ---

async function loadTimetable() {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    try {
        // API 엔드포인트에서 semester_id 없이 호출 (백엔드에서 기본 학기 처리)
        const response = await fetch('/api/timetable-data');
        if (!response.ok) { // 401 등 로그인 필요 처리
             if (response.status === 401) {
                 tbody.innerHTML = ''; // 로그인 안 되어 있으면 내용 비우기 (오버레이가 이미 있음)
             } else {
                 throw new Error(`Network response was not ok (${response.status})`);
             }
             return;
         }
        const data = await response.json();
        // data.semester 정보는 여기선 사용하지 않지만, timetable_management.js 에서는 사용됨
        windowTimetableData = data.subjects || [];

        // 홈 위젯의 과목 전체 메모 파싱
        windowTimetableData.forEach(s => {
            if (typeof s.memo === 'string') {
                try { s.memo = JSON.parse(s.memo); } catch(e) { s.memo = {note: '', todos: []}; }
            }
            if (!s.memo || typeof s.memo !== 'object') s.memo = {note: '', todos: []};
            if (!Array.isArray(s.memo.todos)) s.memo.todos = [];
            if (typeof s.memo.note !== 'string') s.memo.note = '';
        });

        displayTimetable(windowTimetableData);
    } catch (error) {
        console.error('Failed to load timetable:', error);
         // 로그인 상태인데 로드 실패한 경우
        if (document.querySelector('.profile-widget .profile-header .profile-name')) {
             if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-danger); padding: 20px;">시간표 로드 실패</td></tr>';
        } else {
             if (tbody) tbody.innerHTML = ''; // 비로그인이면 비우기
        }
    }
}


/**
 * [수정] displayTimetable
 * - 과목별 색상 적용 로직 추가 (Request 1)
 */
function displayTimetable(subjects) {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    subjectColorMap = {}; // 색상 맵 초기화

    // 1. 과목 데이터로 시간 범위 계산 및 색상 매핑
    let minHour = 9;
    let maxHour = 18;

    if (subjects && subjects.length > 0) {
        let earliestStartHour = 24;
        let latestEndHour = 0;

        subjects.forEach((subject, index) => {
            // 과목별 색상 매핑 (Request 1)
            if (!subjectColorMap[subject.id]) {
                subjectColorMap[subject.id] = subjectColors[index % subjectColors.length];
            }

            subject.timeslots.forEach(ts => {
                const startH = parseInt(ts.start.split(':')[0]);
                const endH = parseInt(ts.end.split(':')[0]);
                const endM = parseInt(ts.end.split(':')[1]);

                earliestStartHour = Math.min(earliestStartHour, startH);
                latestEndHour = Math.max(latestEndHour, (endM > 0 ? endH : endH - 1));
            });
        });

        if (earliestStartHour < 24) minHour = Math.min(minHour, earliestStartHour);
        if (latestEndHour > 0) maxHour = Math.max(maxHour, latestEndHour + 1);
    } else {
        minHour = 9;
        maxHour = 18;
    }


    // 2. 시간표 그리드(행) 생성
    for (let h = minHour; h <= maxHour; h++) {
        const hourStr = String(h).padStart(2, '0');
        const row = document.createElement('tr');
        row.setAttribute('data-hour', hourStr);
        row.innerHTML = `
            <td>${hourStr}:00</td>
            <td data-day="1"></td>
            <td data-day="2"></td>
            <td data-day="3"></td>
            <td data-day="4"></td>
            <td data-day="5"></td>
        `;
        tbody.appendChild(row);
    }

    // 3. 과목 슬롯 배치 함수 호출
    if (subjects.length > 0) {
        positionTimetableSlots(subjects);
    } else {
         // 로그인 상태인데 과목이 없는 경우 메시지 표시
         if (document.querySelector('.profile-widget .profile-header .profile-name')) {
             tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 20px;">이번 학기에 등록된 과목이 없습니다.</td></tr>`;
         } else {
             tbody.innerHTML = ''; // 비로그인이면 비우기
         }
    }
}


/**
 * [수정] positionTimetableSlots
 * - 과목별 색상 적용 로직 추가 (Request 1)
 */
function positionTimetableSlots(subjects) {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;

    requestAnimationFrame(() => {
        const firstRowCell = tbody.querySelector('td[data-day="1"]');
        if (!firstRowCell) {
             console.warn("Timetable grid not ready (no cell).");
             // 로그인 상태인데 과목이 없는 경우 메시지 표시
             if (subjects.length === 0 && document.querySelector('.profile-widget .profile-header .profile-name')) {
                 tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 20px;">이번 학기에 등록된 과목이 없습니다.</td></tr>`;
             } else if (subjects.length === 0) {
                 tbody.innerHTML = ''; // 비로그인이면 비우기
             }
             return;
        }


        const cellHeight = firstRowCell.offsetHeight;
        if (!cellHeight || cellHeight === 0) {
            console.warn("Cell height is 0, cannot position slots. Retrying...");
            setTimeout(() => positionTimetableSlots(subjects), 100);
            return;
        }

        subjects.forEach(subject => {
            // 과목별 색상 가져오기 (Request 1)
            const subjectColor = subjectColorMap[subject.id] || 'rgba(165, 0, 52, 0.1)';
            // 테두리 색상도 과목별로 설정 (Request 1)
            const borderColor = subjectColor.replace('0.1', '0.8'); // 더 진한 색상

            subject.timeslots.forEach(ts => {
                const startHour = parseInt(ts.start.split(':')[0]);
                const startMinute = parseInt(ts.start.split(':')[1]);
                const endHour = parseInt(ts.end.split(':')[0]);
                const endMinute = parseInt(ts.end.split(':')[1]);

                const targetHourStr = String(startHour).padStart(2, '0');
                const cell = tbody.querySelector(`tr[data-hour="${targetHourStr}"] td[data-day="${ts.day}"]`);

                if (!cell) {
                     console.warn(`Cell not found for day ${ts.day}, hour ${targetHourStr} (Out of display range?)`);
                     return;
                }

                const minutesPerHour = 60;
                const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

                const topOffset = (startMinute / minutesPerHour) * cellHeight;
                const slotHeight = Math.max(10, (durationMinutes / minutesPerHour) * cellHeight - 2);

                const slotDiv = document.createElement('div');
                slotDiv.className = 'subject-slot';
                slotDiv.style.top = `${topOffset}px`;
                slotDiv.style.height = `${slotHeight}px`;
                // 과목별 배경색 및 테두리색 적용 (Request 1)
                slotDiv.style.backgroundColor = subjectColor;
                slotDiv.style.borderLeft = `3px solid ${borderColor}`;

                // 뱃지 로직
                let memoIcon = '';
                let todoBadge = '';
                if (subject.memo) {
                    if (subject.memo.note) {
                        memoIcon = '<i class="fas fa-sticky-note timetable-memo-icon"></i>';
                    }
                    if (subject.memo.todos && subject.memo.todos.length > 0) {
                        const pendingTodos = subject.memo.todos.filter(t => !t.done).length;
                        if (pendingTodos > 0) {
                            todoBadge = `<span class="timetable-todo-badge">${pendingTodos}</span>`;
                        }
                    }
                }

                let innerHTML = `<div class="timetable-badges">${memoIcon}${todoBadge}</div>
                                 <div class="slot-subject">${subject.name}</div>`;
                if (slotHeight > 30) {
                    innerHTML += `<div class="slot-room">${ts.room || ''}</div>`;
                }
                slotDiv.innerHTML = innerHTML;

                // 홈 위젯에서는 '과목 전체 메모' 모달을 엶
                slotDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openMemoModal(subject);
                });
                cell.appendChild(slotDiv);
            });
        });
    });
}


// --- 메모 모달 관련 함수들 (홈 화면 '과목 전체 메모'용) ---
function openMemoModal(subject) {
    if (!subject) return;

    currentTimetableItem = subject;

    // subject.memo (과목 전체 메모)를 사용
    let memoObj = subject.memo || { note: '', todos: [] };

    // 데이터 일관성을 위해 파싱 로직 한 번 더 수행
    if (typeof memoObj === 'string') {
        try { memoObj = JSON.parse(memoObj); }
        catch(e) { memoObj = { note: memoObj, todos: [] }; }
    }
    if (!memoObj || typeof memoObj !== 'object') {
        memoObj = { note: '', todos: [] };
    }
    if (!Array.isArray(memoObj.todos)) {
        memoObj.todos = [];
    }
    if (typeof memoObj.note !== 'string') {
         memoObj.note = '';
    }

    currentTimetableItem.memo = memoObj; // 로컬 객체 업데이트

    // 모달 UI 업데이트
    const memoModal = document.getElementById('memoModal');
    if (!memoModal) return;

    const subjectNameEl = memoModal.querySelector('#memoSubjectName');
    const professorEl = memoModal.querySelector('#memoSubjectProfessor');
    const roomEl = memoModal.querySelector('#memoSubjectRoom');
    const memoTextEl = memoModal.querySelector('#memoText');

    if (subjectNameEl) subjectNameEl.textContent = subject.name || '메모/Todo';
    if (professorEl) professorEl.textContent = subject.professor || '-';
    // 여러 시간 중 첫 번째 시간의 강의실 표시
    const room = subject.timeslots && subject.timeslots.length > 0 ? (subject.timeslots[0].room || '-') : '-';
    if (roomEl) roomEl.textContent = room;
    if (memoTextEl) memoTextEl.value = memoObj.note || '';

    renderTodoList(memoObj.todos || []); // todos 렌더링

    memoModal.classList.add('active');
}

function renderTodoList(todos) {
    const todoListUl = document.getElementById('memoTodoList');
    if (!todoListUl) return;
    todoListUl.innerHTML = '';

    if (!todos || todos.length === 0) {
        todoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
        return;
    }

    if (!currentTimetableItem) return;
    if (!currentTimetableItem.memo) {
        currentTimetableItem.memo = { note: '', todos: [] };
    }
     if (!Array.isArray(currentTimetableItem.memo.todos)) {
         currentTimetableItem.memo.todos = [];
     }
    // 현재 상태 반영
    currentTimetableItem.memo.todos = todos;


    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = todo.done ? 'todo-item done' : 'todo-item';
        const todoId = `modal-todo-${index}-${Date.now()}`;

        li.innerHTML = `
            <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
            <label for="${todoId}" class="todo-label">${todo.task}</label>
            <span class="todo-delete-btn" data-index="${index}">&times;</span>
        `;

        // 체크박스 변경 이벤트
        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
             if (currentTimetableItem && currentTimetableItem.memo && currentTimetableItem.memo.todos[index]) {
                currentTimetableItem.memo.todos[index].done = e.target.checked;
                li.classList.toggle('done', e.target.checked);
             }
        });

        // 삭제 버튼 클릭 이벤트
        li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
             if (currentTimetableItem && currentTimetableItem.memo && currentTimetableItem.memo.todos) {
                const indexToRemove = parseInt(e.target.dataset.index, 10);
                currentTimetableItem.memo.todos.splice(indexToRemove, 1);
                renderTodoList(currentTimetableItem.memo.todos); // 목록 다시 렌더링
             }
        });
        todoListUl.appendChild(li);
    });
}


function addTodoItem() {
    const input = document.getElementById('memoNewTodoInput');
    if (!input) return;
    const taskText = input.value.trim();
    if (taskText === '') return;

    const newTodo = { task: taskText, done: false };

    const todoListUl = document.getElementById('memoTodoList');
    if (!todoListUl) return;
    const emptyMsg = todoListUl.querySelector('.todo-empty');
    if (emptyMsg) todoListUl.innerHTML = '';

    if (!currentTimetableItem) return;
    if (!currentTimetableItem.memo) {
        currentTimetableItem.memo = { note: '', todos: [] };
    }
    if (!Array.isArray(currentTimetableItem.memo.todos)) {
        currentTimetableItem.memo.todos = [];
    }

    currentTimetableItem.memo.todos.push(newTodo);
    renderTodoList(currentTimetableItem.memo.todos); // 업데이트된 목록으로 다시 렌더링

    input.value = ''; // 입력 필드 초기화
    input.focus();
}


function closeModal() {
     const memoModal = document.getElementById('memoModal');
     if (memoModal) memoModal.classList.remove('active');
}

// '과목 전체 메모' 저장
async function saveMemo() {
    const memoTextEl = document.getElementById('memoText');
    if (!currentTimetableItem || !memoTextEl) {
        alert("오류: 저장할 과목 정보나 메모 입력 필드를 찾을 수 없습니다.");
        return;
    }

    // currentTimetableItem.memo (로컬 객체)에서 최신 데이터를 가져옴
    const memoText = memoTextEl.value;
    const todos = currentTimetableItem.memo ? (currentTimetableItem.memo.todos || []) : [];

    const memoData = {
        note: memoText.trim(),
        todos: todos
    };

    const subject = currentTimetableItem;
    if (!subject.id) {
        alert("오류: 저장할 과목 ID가 없습니다.");
        return;
    }

    // 서버로 전송할 데이터: 과목 정보 전체 + 업데이트된 memo
    // timeslots는 ID 없이 전송 (백엔드에서 기존 것 삭제 후 재생성)
    const timeslotsToSend = subject.timeslots.map(ts => ({
        day: ts.day, start: ts.start, end: ts.end, room: ts.room
    }));

    const subjectDataToSend = {
         name: subject.name,
         professor: subject.professor,
         credits: subject.credits,
         grade: subject.grade,
         timeslots: timeslotsToSend, // ID 없는 timeslot 정보
         memo: memoData // 업데이트된 메모/Todo
     };


    const saveButton = document.getElementById('saveMemoBtn');
    if (!saveButton) return;
    saveButton.disabled = true;
    saveButton.textContent = '저장 중...';

    try {
        const response = await fetch(`/api/subjects/${subject.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subjectDataToSend)
        });

        const result = await response.json();
        if (result.status !== 'success') {
            throw new Error(result.message || 'Failed to save memo');
        }

        // 성공 시 전역 데이터(windowTimetableData) 업데이트
         const index = windowTimetableData.findIndex(s => s.id === subject.id);
         if (index !== -1) {
             windowTimetableData[index].memo = memoData;
         }

    } catch (error) {
        console.error('Failed to save memo to server:', error);
        alert(`메모 저장에 실패했습니다: ${error.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '저장';
    }

    // 홈 화면 시간표 다시 그리기 (뱃지 업데이트 등)
    displayTimetable(windowTimetableData);
    closeModal();
}