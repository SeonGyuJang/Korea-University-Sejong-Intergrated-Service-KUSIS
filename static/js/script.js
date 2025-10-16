// 전역 변수
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;
let todayStudyTime = 0;
let weeklyStudyTimes = [0, 0, 0, 0, 0, 0, 0]; // 최근 7일
let currentMemo = { day: 0, period: 0, text: '' };

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
    document.getElementById('currentDate').textContent = dateString;
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 타이머 버튼
    document.getElementById('startTimer').addEventListener('click', startTimer);
    document.getElementById('stopTimer').addEventListener('click', stopTimer);
    
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
    
    // 모달 닫기
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.querySelector('.btn-cancel').addEventListener('click', closeModal);
    document.querySelector('.btn-save').addEventListener('click', saveMemo);
    
    // 모달 외부 클릭 시 닫기
    document.getElementById('memoModal').addEventListener('click', (e) => {
        if (e.target.id === 'memoModal') {
            closeModal();
        }
    });
    
    // 사이드바 토글 (모바일)
    document.querySelector('.menu-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar-left').classList.toggle('active');
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
        
        // 공부 시간 저장
        todayStudyTime += timerSeconds;
        weeklyStudyTimes[6] += timerSeconds; // 오늘 = 배열의 마지막
        updateStudyStats();
        saveStudyTime();
        
        // 타이머 초기화
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
    document.getElementById('timerDisplay').textContent = display;
}

// 타이머 프로그레스 업데이트
function updateTimerProgress() {
    const maxSeconds = 14400; // 4시간
    const progress = Math.min((timerSeconds / maxSeconds) * 283, 283);
    const circle = document.getElementById('timerProgress');
    circle.style.strokeDashoffset = 283 - progress;
}

// 공부 시간 통계 업데이트
function updateStudyStats() {
    const todayHours = Math.floor(todayStudyTime / 3600);
    const todayMinutes = Math.floor((todayStudyTime % 3600) / 60);
    document.getElementById('todayTime').textContent = `${todayHours}h ${todayMinutes}m`;
    
    const weeklyAvg = weeklyStudyTimes.reduce((a, b) => a + b, 0) / 7;
    const avgHours = Math.floor(weeklyAvg / 3600);
    const avgMinutes = Math.floor((weeklyAvg % 3600) / 60);
    document.getElementById('weeklyAvg').textContent = `${avgHours}h ${avgMinutes}m`;
}

// 공부 시간 저장
function saveStudyTime() {
    const data = {
        todayStudyTime: todayStudyTime,
        weeklyStudyTimes: weeklyStudyTimes,
        date: new Date().toDateString()
    };
    
    localStorage.setItem('studyTime', JSON.stringify(data));
}

// 공부 시간 불러오기
function loadStudyTime() {
    const saved = localStorage.getItem('studyTime');
    if (saved) {
        const data = JSON.parse(saved);
        const savedDate = new Date(data.date);
        const today = new Date();
        
        // 같은 날이면 데이터 복원
        if (savedDate.toDateString() === today.toDateString()) {
            todayStudyTime = data.todayStudyTime || 0;
            weeklyStudyTimes = data.weeklyStudyTimes || [0, 0, 0, 0, 0, 0, 0];
        } else {
            // 다른 날이면 배열 시프트
            weeklyStudyTimes.shift();
            weeklyStudyTimes.push(0);
            todayStudyTime = 0;
        }
        
        updateStudyStats();
    }
}

// 셔틀버스 일정 로드
function loadShuttleSchedule() {
    fetch('/api/shuttle')
        .then(response => response.json())
        .then(data => {
            window.shuttleData = data;
            displayShuttleSchedule(data);
        })
        .catch(error => console.error('Error loading shuttle schedule:', error));
}

// 셔틀버스 일정 표시
function displayShuttleSchedule(data) {
    const container = document.getElementById('shuttleList');
    container.innerHTML = '';
    
    data.forEach(shuttle => {
        const item = document.createElement('div');
        item.className = 'shuttle-item';
        
        let statusClass = 'scheduled';
        let statusText = shuttle.status;
        
        if (shuttle.status === '운행중') {
            statusClass = 'active';
        } else if (shuttle.status === '운행완료') {
            statusClass = 'completed';
        }
        
        item.innerHTML = `
            <div class="shuttle-time">${shuttle.time}</div>
            <div class="shuttle-route">${shuttle.route}</div>
            <div class="shuttle-status ${statusClass}">${statusText}</div>
        `;
        
        container.appendChild(item);
    });
}

// 셔틀버스 일정 필터링
function filterShuttleSchedule(filter) {
    if (!window.shuttleData) return;
    
    let filtered = window.shuttleData;
    
    if (filter === 'seoul') {
        filtered = window.shuttleData.filter(s => s.route.includes('서울'));
    } else if (filter === 'sejong') {
        filtered = window.shuttleData.filter(s => s.route.includes('세종'));
    }
    
    displayShuttleSchedule(filtered);
}

// 식단 로드
function loadMealPlan(cafeteria) {
    fetch(`/api/meal?cafeteria=${cafeteria}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('breakfast').textContent = data.breakfast;
            document.getElementById('lunch').textContent = data.lunch;
            document.getElementById('dinner').textContent = data.dinner;
        })
        .catch(error => console.error('Error loading meal plan:', error));
}

// 오늘의 일정 로드
function loadTodaySchedule() {
    fetch('/api/schedule')
        .then(response => response.json())
        .then(data => {
            displaySchedule(data);
        })
        .catch(error => console.error('Error loading schedule:', error));
}

// 일정 표시
function displaySchedule(data) {
    const container = document.getElementById('scheduleList');
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

// 시간표 로드
function loadTimetable() {
    fetch('/api/timetable')
        .then(response => response.json())
        .then(data => {
            window.timetableData = data;
            displayTimetable(data);
        })
        .catch(error => console.error('Error loading timetable:', error));
}

// 시간표 표시
function displayTimetable(data) {
    const tbody = document.getElementById('timetableBody');
    tbody.innerHTML = '';
    
    const periods = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30'];
    const timetableMap = {};
    
    // 데이터를 맵으로 변환
    data.forEach(item => {
        const key = `${item.day}-${item.period}`;
        timetableMap[key] = item;
    });
    
    // 시간표 생성
    for (let period = 1; period <= 6; period++) {
        const row = document.createElement('tr');
        
        // 시간 셀
        const timeCell = document.createElement('td');
        timeCell.textContent = periods[period - 1];
        timeCell.style.fontWeight = '600';
        timeCell.style.background = 'var(--bg-primary)';
        row.appendChild(timeCell);
        
        // 요일별 셀
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

// 메모 모달 열기
function openMemoModal(day, period, item) {
    currentMemo = { day, period, text: item.memo || '' };
    document.getElementById('memoText').value = item.memo || '';
    document.getElementById('memoModal').classList.add('active');
}

// 메모 모달 닫기
function closeModal() {
    document.getElementById('memoModal').classList.remove('active');
}

// 메모 저장
function saveMemo() {
    const memoText = document.getElementById('memoText').value;
    
    // 시간표 데이터 업데이트
    const item = window.timetableData.find(t => 
        t.day === currentMemo.day && t.period === currentMemo.period
    );
    
    if (item) {
        item.memo = memoText;
        
        // 서버에 저장 (실제로는 API 호출)
        fetch('/api/timetable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                day: currentMemo.day,
                period: currentMemo.period,
                memo: memoText
            })
        })
        .then(response => response.json())
        .then(() => {
            // 시간표 다시 표시
            displayTimetable(window.timetableData);
            closeModal();
        })
        .catch(error => console.error('Error saving memo:', error));
    }
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
            // 실제 페이지 네비게이션 로직 추가
        }
    });
});