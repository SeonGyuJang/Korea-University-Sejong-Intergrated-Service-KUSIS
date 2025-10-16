// 전역 변수
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;
let todayStudyTime = 0;
let weeklyStudyTimes = [0, 0, 0, 0, 0, 0, 0]; // 최근 7일
let currentMemo = { day: 0, period: 0, text: '' };

// 임시 데이터
const SHUTTLE_SCHEDULE_DATA = [
    {"time": "08:00", "route": "세종 → 서울", "status": "운행예정"},
    {"time": "09:30", "route": "세종 → 서울", "status": "운행예정"},
    {"time": "12:00", "route": "서울 → 세종", "status": "운행중"},
    {"time": "14:30", "route": "세종 → 서울", "status": "운행예정"},
    {"time": "17:00", "route": "서울 → 세종", "status": "운행예정"},
    {"time": "19:00", "route": "서울 → 세종", "status": "운행예정"},
];

const MEAL_PLAN_DATA = {
    "student": {
        "breakfast": "김치찌개, 계란후라이, 김, 깍두기",
        "lunch": "돈까스, 스파게티, 샐러드, 과일",
        "dinner": "제육볶음, 된장찌개, 나물, 김치"
    },
    "faculty": {
        "breakfast": "미역국, 불고기, 계란찜, 김치",
        "lunch": "비빔밥, 된장찌개, 튀김, 과일",
        "dinner": "삼겹살, 김치찌개, 쌈채소, 된장"
    }
};

const SCHEDULE_DATA_DATA = [
    {"time": "09:00", "title": "데이터베이스 설계", "location": "세종관 301호"},
    {"time": "13:00", "title": "웹 프로그래밍", "location": "창의관 205호"},
    {"time": "15:00", "title": "스터디 모임", "location": "도서관 4층"},
];

const TIMETABLE_DATA = [
    {"day": 1, "period": 1, "subject": "데이터베이스", "professor": "김교수", "room": "세종관 301", "memo": ""},
    {"day": 1, "period": 3, "subject": "웹프로그래밍", "professor": "이교수", "room": "창의관 205", "memo": "과제 제출"},
    {"day": 2, "period": 2, "subject": "알고리즘", "professor": "박교수", "room": "세종관 405", "memo": ""},
    {"day": 3, "period": 1, "subject": "데이터베이스", "professor": "김교수", "room": "세종관 301", "memo": ""},
    {"day": 4, "period": 4, "subject": "컴퓨터구조", "professor": "최교수", "room": "창의관 301", "memo": "중간고사 준비"},
    {"day": 5, "period": 1, "subject": "운영체제", "professor": "정교수", "room": "세종관 501", "memo": ""},
];

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // 현재 날짜 표시
    updateCurrentDate();
    
    // 데이터 로드
    loadShuttleSchedule();
    loadMealPlan('student');
    loadTodaySchedule();
    loadTimetable();
    
    // 이벤트 리스너 등록
    setupEventListeners();
    
    // 저장된 공부 시간 불러오기
    loadStudyTime();
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
    const el = document.getElementById('currentDate');
    if (el) el.textContent = dateString;
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
            filterShuttleSchedule(e.target.dataset.tab);
        });
    });
    
    // 모달 관련 이벤트
    const modalCloseBtn = document.querySelector('.modal-close');
    const btnCancel = document.querySelector('.btn-cancel');
    const btnSave = document.querySelector('.btn-save');
    const memoModal = document.getElementById('memoModal');

    if(modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if(btnCancel) btnCancel.addEventListener('click', closeModal);
    if(btnSave) btnSave.addEventListener('click', saveMemo);
    
    if (memoModal) {
        memoModal.addEventListener('click', (e) => {
            if (e.target.id === 'memoModal') {
                closeModal();
            }
        });
    }
    
    // 네비게이션 메뉴 클릭
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('a[target="_blank"]')) {
                e.preventDefault();
                
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                const page = e.currentTarget.dataset.page;
                console.log('Navigate to:', page);
            }
        });
    });
}

// 타이머 시작
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

// 타이머 정지
function stopTimer() {
    if (isTimerRunning) {
        isTimerRunning = false;
        clearInterval(timerInterval);
        
        document.getElementById('startTimer').disabled = false;
        document.getElementById('stopTimer').disabled = true;
        
        todayStudyTime += timerSeconds;
        weeklyStudyTimes[6] += timerSeconds;
        updateStudyStats();
        saveStudyTime();
        
        timerSeconds = 0;
        updateTimerDisplay();
        updateTimerProgress();
    }
}

// 타이머 디스플레이 업데이트
function updateTimerDisplay() {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;
    
    const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const el = document.getElementById('timerDisplay');
    if(el) el.textContent = display;
}

// 타이머 프로그레스 업데이트
function updateTimerProgress() {
    const maxSeconds = 14400; // 4시간
    const progress = Math.min((timerSeconds / maxSeconds) * 283, 283);
    const circle = document.getElementById('timerProgress');
    if (circle) circle.style.strokeDashoffset = 283 - progress;
}

// 공부 시간 통계 업데이트
function updateStudyStats() {
    const todayHours = Math.floor(todayStudyTime / 3600);
    const todayMinutes = Math.floor((todayStudyTime % 3600) / 60);
    const todayEl = document.getElementById('todayTime');
    if (todayEl) todayEl.textContent = `${todayHours}h ${todayMinutes}m`;
    
    const weeklyTotal = weeklyStudyTimes.reduce((a, b) => a + b, 0);
    const weeklyAvg = weeklyTotal > 0 ? weeklyTotal / 7 : 0;
    const avgHours = Math.floor(weeklyAvg / 3600);
    const avgMinutes = Math.floor((weeklyAvg % 3600) / 60);
    const weeklyEl = document.getElementById('weeklyAvg');
    if (weeklyEl) weeklyEl.textContent = `${avgHours}h ${avgMinutes}m`;
}

// 공부 시간 저장/불러오기
function saveStudyTime() {
    const data = {
        todayStudyTime: todayStudyTime,
        weeklyStudyTimes: weeklyStudyTimes,
        date: new Date().toDateString()
    };
    localStorage.setItem('studyTime', JSON.stringify(data));
}

function loadStudyTime() {
    const saved = localStorage.getItem('studyTime');
    if (saved) {
        const data = JSON.parse(saved);
        const savedDate = new Date(data.date);
        const today = new Date();
        
        if (savedDate.toDateString() === today.toDateString()) {
            todayStudyTime = data.todayStudyTime || 0;
            weeklyStudyTimes = data.weeklyStudyTimes || [0, 0, 0, 0, 0, 0, 0];
        } else {
            const daysDiff = Math.floor((today.getTime() - savedDate.getTime()) / (1000 * 3600 * 24));
            if (daysDiff < 7) {
                for (let i = 0; i < daysDiff; i++) {
                    weeklyStudyTimes.shift();
                    weeklyStudyTimes.push(0);
                }
            } else {
                 weeklyStudyTimes = [0, 0, 0, 0, 0, 0, 0];
            }
            todayStudyTime = 0;
        }
        updateStudyStats();
    }
}

// 셔틀버스 일정 로드 (임시 데이터 사용)
function loadShuttleSchedule() {
    window.shuttleData = SHUTTLE_SCHEDULE_DATA;
    displayShuttleSchedule(window.shuttleData);
}

// 셔틀버스 일정 표시
function displayShuttleSchedule(data) {
    const container = document.getElementById('shuttleList');
    if (!container) return;
    container.innerHTML = '';
    
    data.forEach(shuttle => {
        const item = document.createElement('div');
        item.className = 'shuttle-item';
        
        let statusClass = 'scheduled';
        if (shuttle.status === '운행중') statusClass = 'active';
        else if (shuttle.status === '운행완료') statusClass = 'completed';
        
        item.innerHTML = `
            <div class="shuttle-time">${shuttle.time}</div>
            <div class="shuttle-route">${shuttle.route}</div>
            <div class="shuttle-status ${statusClass}">${shuttle.status}</div>
        `;
        container.appendChild(item);
    });
}

// 셔틀버스 일정 필터링
function filterShuttleSchedule(filter) {
    if (!window.shuttleData) return;
    
    let filteredData = window.shuttleData;
    if (filter === 'seoul') {
        filteredData = window.shuttleData.filter(s => s.route.includes('서울'));
    } else if (filter === 'sejong') {
        filteredData = window.shuttleData.filter(s => s.route.includes('세종'));
    }
    
    displayShuttleSchedule(filteredData);
}

// 식단 로드 (임시 데이터 사용)
function loadMealPlan(cafeteria) {
    const data = MEAL_PLAN_DATA[cafeteria] || MEAL_PLAN_DATA['student'];
    const breakfastEl = document.getElementById('breakfast');
    const lunchEl = document.getElementById('lunch');
    const dinnerEl = document.getElementById('dinner');

    if (breakfastEl) breakfastEl.textContent = data.breakfast;
    if (lunchEl) lunchEl.textContent = data.lunch;
    if (dinnerEl) dinnerEl.textContent = data.dinner;
}

// 오늘의 일정 로드 (임시 데이터 사용)
function loadTodaySchedule() {
    displaySchedule(SCHEDULE_DATA_DATA);
}

// 일정 표시
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

// 시간표 로드 (임시 데이터 사용)
function loadTimetable() {
    window.timetableData = TIMETABLE_DATA;
    displayTimetable(window.timetableData);
}

// 시간표 표시
function displayTimetable(data) {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const periods = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30'];
    const timetableMap = data.reduce((map, item) => {
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
            
            if (timetableMap[key]) {
                const item = timetableMap[key];
                const cellDiv = document.createElement('div');
                cellDiv.className = 'timetable-cell';
                cellDiv.innerHTML = `
                    <div class="timetable-subject">${item.subject}</div>
                    <div class="timetable-professor">${item.professor}</div>
                    <div class="timetable-room">${item.room}</div>
                    ${item.memo ? '<i class="fas fa-sticky-note timetable-memo-icon"></i>' : ''}
                `;
                cellDiv.addEventListener('click', () => openMemoModal(day, period, item));
                cell.appendChild(cellDiv);
            }
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
}

// 메모 모달 관련 함수
function openMemoModal(day, period, item) {
    currentMemo = { day, period, text: item.memo || '' };
    document.getElementById('memoText').value = item.memo || '';
    document.getElementById('memoModal').classList.add('active');
}

function closeModal() {
    document.getElementById('memoModal').classList.remove('active');
}

function saveMemo() {
    const memoText = document.getElementById('memoText').value;
    const item = window.timetableData.find(t => t.day === currentMemo.day && t.period === currentMemo.period);
    
    if (item) {
        item.memo = memoText;
        console.log('Saving memo (local):', item);
        displayTimetable(window.timetableData); // 시간표 다시 렌더링
    }
    
    closeModal();
}