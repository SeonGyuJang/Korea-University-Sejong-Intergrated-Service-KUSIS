// 전역 변수
let timerInterval = null;
let shuttleUpdateInterval = null; // 셔틀버스 실시간 업데이트 인터벌
let timerSeconds = 0;
let isTimerRunning = false;
let todayStudyTime = 0; // DB에서 불러온 오늘의 총 공부 시간 (초)

// (수정) Request 4 -> (수정) DB연동
// currentMemoData는 이제 사용되지 않음.
// currentTimetableItem은 이제 subject 객체 전체를 저장함.
let currentTimetableItem = null; // (수정) 현재 선택된 'Subject' 객체

// (삭제) 임시 데이터 (API를 통해 가져옴)
// const SCHEDULE_DATA_DATA = [ ... ];
// const TIMETABLE_DATA = [ ... ];
let windowTimetableData = []; // (수정) 전역 시간표 데이터 (Subject 배열)

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
        loadTimetable(); // (수정) 새 로직으로 실행
    }

    // 셔틀버스 실시간 업데이트 시작
    startRealTimeUpdates();
    
    // 이벤트 리스너 등록
    setupEventListeners();
}

// 현재 날짜 업데이트
function updateCurrentDate() {
    // (파일 기준일 2025/10/16 목요일로 고정)
    // const now = new Date(2025, 9, 16); // 9 = 10월
    // (수정) 실시간으로 변경
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

    // (수정) Request 4 -> (수정) DB연동
    // 메모/Todo 저장 버튼
    const btnSaveMemo = document.getElementById('saveMemoBtn');
    if(btnSaveMemo) btnSaveMemo.addEventListener('click', saveMemo); // (수정) 새 saveMemo 함수 호출
    
    // (신규) Request 4 -> (수정) DB연동
    // Todo 추가 버튼
    const btnAddTodo = document.getElementById('memoAddTodoBtn');
    if(btnAddTodo) btnAddTodo.addEventListener('click', addTodoItem);
    // (신규) Request 4 -> (수정) DB연동
    // Todo 입력창에서 Enter 키로 추가
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
            
            // (수정) 홈, 시간표관리 등 내부 링크는 active 클래스 토글
            if (linkUrl && linkUrl !== '#') {
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                e.currentTarget.classList.add('active');
            }


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
        date: new Date().toISOString().split('T')[0] // (수정) 오늘 날짜 기준
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


// --- 셔틀버스 함수 (기존과 동일, 날짜 로직 수정) ---
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
    
    // (수정) 실시간 날짜 기준으로 '평일'/'일요일' 필터링
    const TODAY_DATE = new Date();
    const todayDayOfWeek = TODAY_DATE.getDay(); // 0:일요일, 6:토요일
    
    // (수정) 토요일은 일요일 시간표를 따르는지, 아니면 운행이 없는지 확인 필요.
    // 여기서는 일요일(0) 또는 토요일(6)이면 '일요일' 시간표를, 나머지는 '평일'로 가정
    const dayType = (todayDayOfWeek === 0 || todayDayOfWeek === 6) ? '일요일' : '평일';
    
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
    // (수정) 실시간 기준
    const currentSecondsOfDay = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());

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
            html += `<td>${student[date] ? student[date].breakfast : '정보 없음'}</td>`;
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
                const dailyLunch = student[date] ? student[date].lunch : null;
                const menuText = (dailyLunch && typeof dailyLunch === 'object') ? dailyLunch[meal.id] : (dailyLunch || '정보 없음');
                html += `<td><span class="meal-category-title">${meal.name}</span><div class="meal-menu-text">${menuText}</div></td>`;
            });
            html += `</tr>`;
        });
        html += `<tr><td class="meal-type-cell">학생 식당 - 석식</td>`;
        dates.forEach(date => {
            html += `<td>${student[date] ? student[date].dinner : '정보 없음'}</td>`;
        });
        html += `</tr>`;
    }
    if (faculty) {
        html += `<tr><td class="meal-type-cell">교직원 식당 - 중식</td>`;
        dates.forEach(date => {
            html += `<td>${faculty[date] ? faculty[date].lunch : '정보 없음'}</td>`;
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
        // (수정) /api/timetable -> /api/timetable-data (자동으로 최신 학기 로드)
        const response = await fetch('/api/timetable-data'); 
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        windowTimetableData = data.subjects || []; // (수정) 전역 변수에 subject 배열 저장
        displayTimetable(windowTimetableData);
        
    } catch (error) {
        console.error('Failed to load timetable:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-danger); padding: 20px;">시간표 로드 실패</td></tr>';
    }
}

// (수정) 시간표 렌더링 (시간 기반)
function displayTimetable(subjects) {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    
    // 기존 슬롯 모두 제거 (tbody는 템플릿에서 이미 9-17시 TR/TD를 그림)
    tbody.querySelectorAll('.subject-slot').forEach(slot => slot.remove());
    // (신규) 빈 셀 클릭 이벤트도 초기화
    tbody.querySelectorAll('.timetable-cell.empty').forEach(cell => cell.remove());

    // 템플릿에서 그린 9-17시 TR/TD를 그대로 사용
    // (주의: index.html의 tbody가 비어있으면 이 로직은 실패함)
    // (수정) index.html의 tbody가 9-17시 구조를 갖는다고 가정함
    
    // (수정) 셀 높이 계산을 위해 requestAnimationFrame 사용
    requestAnimationFrame(() => {
        const firstRowCell = tbody.querySelector('td[data-day="1"]');
        if (!firstRowCell) {
            console.warn("Timetable grid not ready.");
            // (수정) 템플릿이 비어있을 경우(레거시) 대비, 9-17시 그리드 동적 생성
            if (tbody.children.length === 0) {
                 console.log("Dynamically creating timetable grid (9-17)");
                 const hours = ['09', '10', '11', '12', '13', '14', '15', '16', '17'];
                 hours.forEach(hour => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${hour}:00</td>
                        <td data-day="1" data-hour="${hour}"></td>
                        <td data-day="2" data-hour="${hour}"></td>
                        <td data-day="3" data-hour="${hour}"></td>
                        <td data-day="4" data-hour="${hour}"></td>
                        <td data-day="5" data-hour="${hour}"></td>
                    `;
                    tbody.appendChild(row);
                 });
                 // 그리드 생성 후 다시 렌더링 시도
                 displayTimetable(subjects);
                 return;
            }
             console.error("Timetable cell not found, but tbody is not empty.");
             return;
        }

        const cellHeight = firstRowCell.offsetHeight;
        if (!cellHeight || cellHeight === 0) {
            console.warn("Cell height is 0, cannot position slots.");
            return;
        }

        subjects.forEach(subject => {
            subject.timeslots.forEach(ts => {
                const startHour = parseInt(ts.start.split(':')[0]);
                const startMinute = parseInt(ts.start.split(':')[1]);
                const endHour = parseInt(ts.end.split(':')[0]);
                const endMinute = parseInt(ts.end.split(':')[1]);

                // 9시 ~ 17시 범위 내의 시간표만 그림
                if (startHour < 9 || startHour > 17) return;

                const targetHourStr = String(startHour).padStart(2, '0');
                const cell = tbody.querySelector(`td[data-day="${ts.day}"][data-hour="${targetHourStr}"]`);

                if (!cell) {
                     console.warn(`Cell not found for day ${ts.day}, hour ${targetHourStr}`);
                     return;
                }

                const minutesPerHour = 60;
                // 셀 시작 시간(e.g., 9:00) 기준 offset
                const startOffsetMinutes = startMinute; 
                // 과목의 총 지속 시간 (분)
                const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

                const topOffset = (startOffsetMinutes / minutesPerHour) * cellHeight;
                const slotHeight = (durationMinutes / minutesPerHour) * cellHeight;

                const slotDiv = document.createElement('div');
                slotDiv.className = 'subject-slot'; // (수정) main.css에 추가된 스타일
                slotDiv.style.top = `${topOffset}px`;
                slotDiv.style.height = `${slotHeight}px`;
                
                // (수정) 뱃지 로직 추가
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

                slotDiv.innerHTML = `
                    <div class="timetable-badges">
                        ${memoIcon}
                        ${todoBadge}
                    </div>
                    <div class="slot-subject">${subject.name}</div>
                    <div class="slot-room">${ts.room || ''}</div>
                `;
                // (수정) 새 openMemoModal 함수 호출
                slotDiv.addEventListener('click', (e) => {
                    e.stopPropagation(); // 셀 클릭 방지
                    openMemoModal(subject);
                });
                cell.appendChild(slotDiv);
            });
        });
        
        // (신규) 빈 셀에도 클릭 이벤트 추가 (메모/Todo 추가용)
        tbody.querySelectorAll('td[data-day]').forEach(cell => {
            if (cell.children.length === 0) { // 과목 슬롯이 없는 셀
                const cellDiv = document.createElement('div');
                cellDiv.className = 'timetable-cell empty add-new';
                cellDiv.innerHTML = `<i class="fas fa-plus"></i>`;
                cellDiv.addEventListener('click', () => {
                    // (수정) 빈 셀 클릭 시, Subject가 없는 상태로 모달 열기 (저장 로직 필요)
                    // TODO: 빈 셀에 대한 메모 저장은 현재 API가 지원하지 않음.
                    // 이 기능은 timetable_management.html에서 "과목 추가"로 유도해야 함.
                    // 여기서는 alert로 대체
                    alert('메모/Todo는 과목에만 추가할 수 있습니다.\n시간표 관리 탭에서 과목을 추가해주세요.');
                });
                // cell.appendChild(cellDiv); // (주석 처리) 빈 셀 클릭 기능 비활성화
            }
        });
    });
}

// (수정) Request 4 -> (수정) DB연동
// 메모 & Todo 모달 열기 (Subject 객체 기반)
function openMemoModal(subject) {
    if (!subject) {
        console.error("Subject data is missing.");
        return;
    }

    // 전역 변수에 현재 'Subject' 객체 저장
    currentTimetableItem = subject;
    
    let memoObj = subject.memo || { note: '', todos: [] };
    // (호환성) memo가 문자열일 경우 객체로 변환
    if (typeof memoObj === 'string') {
        memoObj = { note: memoObj, todos: [] };
    }

    // (수정) 모달에 과목 정보 표시 (index.html의 모달 ID 사용)
    document.getElementById('memoSubjectName').textContent = subject.name || '메모/Todo';
    document.getElementById('memoSubjectProfessor').textContent = subject.professor || '-';
    // (수정) 강의실 정보는 timeslots에서 가져와야 함 (첫 번째 슬롯 기준)
    const room = subject.timeslots && subject.timeslots.length > 0 ? subject.timeslots[0].room : '-';
    document.getElementById('memoSubjectRoom').textContent = room || '-';

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
    
    // (수정) 전역 객체에 저장된 todos 배열을 직접 조작하도록 변경
    currentTimetableItem.memo.todos = todos;
    
    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = todo.done ? 'todo-item done' : 'todo-item';
        
        // (수정) ID 고유성 보장
        const todoId = `modal-todo-${index}-${Date.now()}`;
        
        li.innerHTML = `
            <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
            <label for="${todoId}" class="todo-label">${todo.task}</label>
            <span class="todo-delete-btn" data-index="${index}">&times;</span>
        `;
        
        // (신규) 체크박스 변경 시 이벤트 (전역 객체 수정)
        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            currentTimetableItem.memo.todos[index].done = e.target.checked;
            li.classList.toggle('done', e.target.checked);
        });
        
        // (신규) 삭제 버튼 클릭 시 이벤트 (전역 객체 수정)
        li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            currentTimetableItem.memo.todos.splice(indexToRemove, 1); // 배열에서 삭제
            renderTodoList(currentTimetableItem.memo.todos); // 목록 새로고침
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
    
    // '할 일이 없습니다' 메시지 제거
    const todoListUl = document.getElementById('memoTodoList');
    const emptyMsg = todoListUl.querySelector('.todo-empty');
    if (emptyMsg) {
        todoListUl.innerHTML = '';
    }
    
    // (수정) 전역 객체(currentTimetableItem)의 memo.todos에 직접 추가
    if (!currentTimetableItem.memo) {
        currentTimetableItem.memo = { note: '', todos: [] };
    }
    if (!currentTimetableItem.memo.todos) {
        currentTimetableItem.memo.todos = [];
    }
    
    currentTimetableItem.memo.todos.push(newTodo);
    renderTodoList(currentTimetableItem.memo.todos); // 목록 새로고침
    
    input.value = '';
    input.focus();
}


function closeModal() {
    document.getElementById('memoModal').classList.remove('active');
}

// (수정) Request 4 -> (수정) DB연동
// 메모/Todo 저장 (API PUT 호출)
async function saveMemo() {
    const memoText = document.getElementById('memoText').value;
    
    // (수정) UI에서 Todo 리스트 읽어오기 (renderTodoList에서 이미 전역 객체에 반영됨)
    const todos = currentTimetableItem.memo.todos || [];
    
    // (신규) 저장할 메모 객체 생성
    const memoData = {
        note: memoText.trim(),
        todos: todos
    };

    // 전역 변수에서 현재 아이템(Subject) 찾기
    const subject = currentTimetableItem; 
    
    if (!subject || !subject.id) {
        alert("오류: 저장할 과목 정보가 없습니다.");
        return;
    }

    // (수정) PUT 요청에 필요한 전체 과목 데이터 구성
    // (주의: API는 전체 Subject 객체를 받기를 기대함)
    const subjectData = {
        ...subject, // 기존 과목 정보 (name, professor, credits 등)
        memo: memoData // 방금 수정한 메모/Todo 객체
    };
    
    // (수정) 불필요한/순환 참조 데이터 제거 (필요시)
    // delete subjectData.user; 
    
    const saveButton = document.getElementById('saveMemoBtn');
    saveButton.disabled = true;
    saveButton.textContent = '저장 중...';

    try {
        // (수정) API 엔드포인트 및 메서드 변경
        const response = await fetch(`/api/subjects/${subject.id}`, { 
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subjectData) // (수정) 전체 Subject 객체 전송
        });
        
        const result = await response.json();
        if (result.status !== 'success') {
            throw new Error(result.message || 'Failed to save memo');
        }
        
        console.log('Memo/Todo saved successfully to server');
        // (성공) UI 데이터 갱신 (전역 변수 업데이트)
        subject.memo = memoData;
        
    } catch (error) {
        console.error('Failed to save memo to server:', error);
        alert(`메모 저장에 실패했습니다: ${error.message}`);
        // (실패 시 롤백은 하지 않음, 사용자가 다시 시도하도록 함)
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '저장';
    }
    
    // 3. UI 다시 렌더링 (메모/Todo 뱃지 등 반영)
    displayTimetable(windowTimetableData); 
    
    closeModal();
}