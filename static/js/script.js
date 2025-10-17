// 전역 변수
let timerInterval = null;
let shuttleUpdateInterval = null; // 셔틀버스 실시간 업데이트 인터벌
let timerSeconds = 0;
let isTimerRunning = false;
let todayStudyTime = 0;
let weeklyStudyTimes = [0, 0, 0, 0, 0, 0, 0]; // 최근 7일
let currentMemo = { day: 0, period: 0, text: '' };

// 임시 데이터 (API를 통해 가져오는 셔틀/식단 외의 데이터는 유지)
const SCHEDULE_DATA_DATA = [
    {"time": "09:00", "title": "과목1", "location": "석경 424호"},
    {"time": "13:00", "title": "과목2", "location": "농심국제관 205호"},
    {"time": "15:00", "title": "과목3", "location": "과기1관 303호"},
];

const TIMETABLE_DATA = [
    {"day": 1, "period": 1, "subject": "과목1", "professor": "김교수", "room": "석경 424호", "memo": ""},
    {"day": 1, "period": 3, "subject": "과목2", "professor": "이교수", "room": "농심국제관 205호", "memo": "과제 제출"},
    {"day": 2, "period": 2, "subject": "과목3", "professor": "박교수", "room": "과기1관 303호", "memo": ""},
    {"day": 3, "period": 1, "subject": "과목4", "professor": "김교수", "room": "공정대 102호", "memo": ""},
    {"day": 4, "period": 4, "subject": "과목5", "professor": "최교수", "room": "농심국제관 301호", "memo": "중간고사 준비"},
    {"day": 5, "period": 1, "subject": "과목6", "professor": "정교수", "room": "과기2관 111호", "memo": ""},
];

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // 현재 날짜 표시
    updateCurrentDate();
    
    // 데이터 로드
    loadShuttleSchedule(); // API에서 데이터 로드
    loadMealPlan('student'); // API에서 데이터 로드
    loadTodaySchedule();
    loadTimetable();

    // 셔틀버스 실시간 업데이트 시작
    startRealTimeUpdates();
    
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

    const btnSave = document.querySelector('#memoModal .btn-save');
    if(btnSave) btnSave.addEventListener('click', saveMemo);
    
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
    // --- 수정 완료 ---
    
    // **[수정] 네비게이션 메뉴 클릭 (내부 링크 이동 로직 추가)**
    const loadingOverlay = document.getElementById('loadingOverlay');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // 1. 클릭된 요소의 href 속성과 data-url 속성을 가져옵니다.
            const linkUrl = e.currentTarget.getAttribute('href');
            const dataUrl = e.currentTarget.dataset.url;
            // const page = e.currentTarget.dataset.page; // 'admin', 'login' 등

            // 2. 항상 기본 동작 방지 (CSS 효과를 먼저 적용하기 위해)
            e.preventDefault();

            // 3. Active 클래스 업데이트
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');

            if (dataUrl) {
                // 4-1. 외부 링크 (data-url이 있는 경우): 새 탭 열기
                if (loadingOverlay) {
                    loadingOverlay.classList.add('active');
                }

                setTimeout(() => {
                    window.open(dataUrl, '_blank');
                    if (loadingOverlay) {
                        loadingOverlay.classList.remove('active');
                    }
                    // 외부 링크는 현재 페이지를 이동시키지 않으며, 현재 활성 상태를 유지
                }, 1500); // 1.5초 후 새 탭 열기
            } else if (linkUrl && linkUrl !== '#') {
                // 4-2. 내부 링크 (data-url이 없고 href가 '#'이 아닌 경우): 현재 탭에서 페이지 이동
                // 'admin', 'login', 'register', 'logout' 등의 내부 Flask 라우트가 여기에 해당합니다.
                window.location.href = linkUrl;
            }
        });
    });
    // **[수정 완료]**
}


// 타이머 시작/정지/업데이트 함수 (변경 없음, 유지)
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
        
        todayStudyTime += timerSeconds;
        weeklyStudyTimes[6] += timerSeconds;
        updateStudyStats();
        saveStudyTime();
        
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


// 셔틀버스 실시간 업데이트 시작
function startRealTimeUpdates() {
    // 1초마다 현재 시간 업데이트 및 셔틀버스 시간표 재계산/재렌더링
    if (shuttleUpdateInterval) clearInterval(shuttleUpdateInterval);
    shuttleUpdateInterval = setInterval(() => {
        updateCurrentTimeDisplay();
        updateRealTimeShuttle();
    }, 1000);
}

// 셔틀버스 일정 로드 (API 사용)
async function loadShuttleSchedule() {
    try {
        const response = await fetch('/api/shuttle');
        const data = await response.json();
        window.shuttleData = data;
        // 데이터 로드 후 실시간 업데이트 함수를 호출하여 초기 화면 렌더링
        updateRealTimeShuttle();
    } catch (error) {
        console.error('Failed to load shuttle schedule:', error);
        window.shuttleData = [];
        updateRealTimeShuttle(); // 오류 메시지 표시를 위해 호출
    }
}

// 셔틀버스 실시간 업데이트 및 표시
function updateRealTimeShuttle() {
    const container = document.getElementById('shuttleList');
    if (!container) return;

    // 현재 활성화된 필터 탭 확인
    const activeTab = document.querySelector('.shuttle-widget .tab.active');
    const currentFilter = activeTab ? activeTab.dataset.tab : 'all';
    
    // 현재 필터에 맞는 데이터 필터링
    let data = window.shuttleData || [];
    
    // 1. 요일 필터링 (2025/10/16 목요일 기준, '평일' 데이터만 필터링)
    // 실제 날짜는 2025/10/16 (목요일)로 가정
    const TODAY_DATE = new Date(2025, 9, 16); // Month is 0-indexed, so 9 is October
    const todayDayOfWeek = TODAY_DATE.getDay(); // 0=Sunday, 4=Thursday(목요일)
    const dayType = todayDayOfWeek === 0 || todayDayOfWeek === 6 ? '일요일' : '평일';

    data = data.filter(s => s.type === dayType || s.type === '기타');
    
    // 2. 경로 필터링
    data = data.filter(s => {
        switch (currentFilter) {
            case 'school_to_station':
                // 학교 → 조치원역 방면 노선 필터링 (오송 경유 포함)
                return s.route.includes('학교 → 조치원역');
            case 'station_to_school':
                // 조치원역 → 학교 노선 필터링 (오송 경유 포함)
                return s.route.includes('조치원/오송역 → 학교') || s.route === '조치원역 → 학교';
            case 'osong':
                // 오송역 노선 필터링 (Osong_Included 그룹 필터)
                return s.route_group === 'Osong_Included';
            case 'all':
            default:
                return true;
        }
    });

    // --- 실시간 계산, 완료 항목 제거, 시간 순 정렬 ---
    const now = new Date();
    // 현재는 2025/10/16 00:00:00 기준으로 계산
    const currentSecondsOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    // 실제 시간 대신 임시 고정 시간(예: 17:30)을 사용하려면 아래 주석 해제 (디버깅용)
    // const DEBUG_HOUR = 17;
    // const DEBUG_MINUTE = 30;
    // const currentSecondsOfDay = DEBUG_HOUR * 3600 + DEBUG_MINUTE * 60;


    let processedData = data
        .map(shuttle => {
            const [hour, minute] = shuttle.time.split(':').map(Number);
            shuttle.shuttleSecondsOfDay = hour * 3600 + minute * 60;
            shuttle.remainingTimeSeconds = shuttle.shuttleSecondsOfDay - currentSecondsOfDay;
            return shuttle;
        })
        .filter(shuttle => {
            // 운행이 완료된 것(출발 시각이 현재 시각보다 0초 이상 지난 경우)은 표시하지 않음
            return shuttle.remainingTimeSeconds > 0; 
        })
        .sort((a, b) => a.shuttleSecondsOfDay - b.shuttleSecondsOfDay); // 시간 순으로 정렬

    container.innerHTML = '';
    
    if (processedData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">운행 예정인 시간표 정보가 없습니다.</p>';
        return;
    }
    
    processedData.forEach((shuttle, index) => {
        const remainingTimeSeconds = shuttle.remainingTimeSeconds;
        let statusText = '';
        let statusClass = 'scheduled';
        
        // 상위 2개 항목에만 next-shuttle 클래스 적용
        const isNextShuttle = (index < 2); 

        if (remainingTimeSeconds <= 300) { 
            // 5분 이내 (깜빡임 효과)
            const remainingMins = Math.floor(remainingTimeSeconds / 60);
            const remainingSecs = remainingTimeSeconds % 60;
            
            statusText = `도착까지 ${String(remainingMins).padStart(2, '0')}분 ${String(remainingSecs).padStart(2, '0')}초`;
            statusClass = 'active blinking'; // active와 blinking 함께 적용

        } else {
            // 5분 초과
            const remainingHours = Math.floor(remainingTimeSeconds / 3600);
            const remainingMins = Math.floor((remainingTimeSeconds % 3600) / 60);
            
            let minDisplay = '';
            if (remainingHours > 0) {
                 minDisplay = `${remainingHours}시간 ${remainingMins}분`;
            } else {
                 minDisplay = `${remainingMins}분 남음`;
            }
            statusText = `도착까지 ${minDisplay}`;
            // 5분 초과 항목은 next-shuttle이더라도 green status 텍스트는 적용하지 않고 scheduled(회색) 유지 (시각적 일관성)
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

// --- 신규: 셔틀버스 전체 시간표 모달 기능 ---
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
    
    // 데이터 그룹화: { '평일': { 'Jochiwon': [...], 'Osong_Included': [...] }, '일요일': {...} }
    const groupedData = data.reduce((acc, shuttle) => {
        acc[shuttle.type] = acc[shuttle.type] || {};
        const groupKey = shuttle.route_group === 'Osong_Included' ? 'Osong' : 'Jochiwon';
        acc[shuttle.type][groupKey] = acc[shuttle.type][groupKey] || [];
        acc[shuttle.type][groupKey].push(shuttle);
        return acc;
    }, {});

    // 시간 순으로 정렬
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

    if (html === '') {
         container.innerHTML = '<p style="text-align: center; padding: 20px;">시간표 정보가 없습니다.</p>';
    } else {
         container.innerHTML = html;
    }
}

// 식단 로드 (API 사용, 중식 3단계 분리 반영)
async function loadMealPlan(cafeteria) {
    try {
        const response = await fetch(`/api/meal?cafeteria=${cafeteria}`);
        const data = await response.json();
        
        const studentLunchContainer = document.getElementById('studentLunchContainer');
        const facultyLunchContainer = document.getElementById('facultyLunchContainer');
        const lunchFaculty = document.getElementById('lunch-faculty');
        
        // 조식/석식 공통 업데이트
        document.getElementById('breakfast').textContent = data.breakfast || '식단 정보 없음';
        document.getElementById('dinner').textContent = data.dinner || '식단 정보 없음';

        if (cafeteria === 'student') {
            // 학생 식당 (중식 3단계)
            if (studentLunchContainer) studentLunchContainer.style.display = 'block'; 
            if (facultyLunchContainer) facultyLunchContainer.style.display = 'none';

            if (typeof data.lunch === 'object') {
                document.getElementById('lunch-korean').textContent = data.lunch.korean || '식단 정보 없음';
                document.getElementById('lunch-ala_carte').textContent = data.lunch.ala_carte || '식단 정보 없음';
                document.getElementById('lunch-snack_plus').textContent = data.lunch.snack_plus || '식단 정보 없음';
            } else {
                // API 응답 구조 오류 시
                document.getElementById('lunch-korean').textContent = '데이터 오류';
                document.getElementById('lunch-ala_carte').textContent = '데이터 오류';
                document.getElementById('lunch-snack_plus').textContent = '데이터 오류';
            }

        } else if (cafeteria === 'faculty') {
            // 교직원 식당 (중식 단일)
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


// --- 신규: 주간 식단표 모달 기능 ---
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
    
    // 날짜 키 추출 및 토요일/일요일 필터링 (사용자 요청 반영)
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
    
    const mealTypes = [
        { id: 'breakfast', name: '조식', isStudentOnly: true },
        { id: 'lunch-korean', name: '한식', isStudentOnly: true },
        { id: 'lunch-ala_carte', name: '일품/분식', isStudentOnly: true },
        { id: 'lunch-snack_plus', name: 'Plus', isStudentOnly: true },
        { id: 'lunch', name: '중식', isStudentOnly: false, isFacultyOnly: true },
        { id: 'dinner', name: '석식', isStudentOnly: true }
    ];
    
    const student = data.식단.student;
    const faculty = data.식단.faculty;

    // 학생 식당 렌더링
    if (student) {
        
        // 학생 식당 조식
        html += `<tr><td class="meal-type-cell">학생 식당 - 조식</td>`;
        dates.forEach(date => {
            html += `<td>${student[date].breakfast || '정보 없음'}</td>`;
        });
        html += `</tr>`;
        
        // 학생 식당 중식 (3가지 코너)
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

        // 학생 식당 석식
        html += `<tr><td class="meal-type-cell">학생 식당 - 석식</td>`;
        dates.forEach(date => {
            html += `<td>${student[date].dinner || '정보 없음'}</td>`;
        });
        html += `</tr>`;
    }
    
    // 교직원 식당 렌더링
    if (faculty) {
        // 교직원 식당 중식 (단일 메뉴)
        html += `<tr><td class="meal-type-cell">교직원 식당 - 중식</td>`;
        dates.forEach(date => {
            html += `<td>${faculty[date].lunch || '정보 없음'}</td>`;
        });
        html += `</tr>`;
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}

// 오늘의 일정 로드/표시/시간표/메모 함수 (변경 없음, 유지)
function loadTodaySchedule() {
    displaySchedule(SCHEDULE_DATA_DATA);
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

function loadTimetable() {
    window.timetableData = TIMETABLE_DATA;
    displayTimetable(window.timetableData);
}

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