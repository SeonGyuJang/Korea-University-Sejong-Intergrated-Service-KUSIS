document.addEventListener('DOMContentLoaded', () => {

    // --- 전역 변수 ---
    let currentSemesterId = null;
    let currentSemesterInfo = null; // 현재 선택된 학기 정보 (year, season, start_date 등) 저장
    let allSemesters = [];
    let currentSubjects = [];
    let gpaChartInstance = null;
    let selectedSubjectForDetails = null;

    let currentWeek = 1;
    const TOTAL_WEEKS = 16;
    let currentWeeklyData = { note: "", todos: [] };

    // 과목별 색상 팔레트 (script.js와 동일하게 유지)
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
    let subjectColorMap = {};

    // --- DOM 요소 캐싱 ---
    const semesterSelect = document.getElementById('semesterSelect');
    const timetableBody = document.getElementById('timetableEditorBody');
    const addSubjectBtn = document.getElementById('addSubjectBtn');

    // 왼쪽 사이드 위젯 DOM
    const creditProgressCircle = document.getElementById('creditProgress');
    const creditPercentageEl = document.getElementById('creditPercentage');
    const currentCreditsEl = document.getElementById('currentCredits');
    const goalCreditsEl = document.getElementById('goalCredits');
    const remainingCreditsEl = document.getElementById('remainingCredits');
    const overallGpaEl = document.getElementById('overallGpa');
    const editGoalBtn = document.getElementById('editGoalBtn');
    const editGoalForm = document.getElementById('editGoalForm');
    const newGoalInput = document.getElementById('newGoalCredits');
    const saveGoalBtn = document.getElementById('saveGoalBtn');
    const cancelGoalBtn = document.getElementById('cancelGoalBtn');
    const gpaChartCanvas = document.getElementById('gpaChart');
    const refreshGpaChartBtn = document.getElementById('refreshGpaChartBtn');
    const todoSummaryList = document.getElementById('todoSummaryList');

    // 오른쪽 과목 상세 정보 사이드바 DOM
    const subjectDetailsListUl = document.getElementById('subjectDetailsList');
    const weeklyDetailsTitle = document.getElementById('weeklyDetailsTitle');
    const viewAllWeeksBtn = document.getElementById('viewAllWeeksBtn');
    const prevWeekBtn = document.getElementById('prevWeekBtn');
    const currentWeekDisplay = document.getElementById('currentWeekDisplay');
    const nextWeekBtn = document.getElementById('nextWeekBtn');
    const weeklyMemoSubjectName = document.getElementById('weeklyMemoSubjectName');
    const weeklyTodoSubjectName = document.getElementById('weeklyTodoSubjectName');
    const weeklyMemoText = document.getElementById('weeklyMemoText');
    const weeklyTodoListUl = document.getElementById('weeklyTodoList');
    const weeklyNewTodoInput = document.getElementById('weeklyNewTodoInput');
    const weeklyAddTodoBtn = document.getElementById('weeklyAddTodoBtn');
    const saveWeeklyMemoTodoBtn = document.getElementById('saveWeeklyMemoTodoBtn');

    // 탭 DOM
    document.querySelectorAll('.widget-tabs .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.dataset.tab;
            document.querySelectorAll('.widget-tabs .tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.widget-tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `tab-content-${targetTab}`);
            });
        });
    });

    // --- 모달 DOM ---
    const addSubjectModal = document.getElementById('addSubjectModal');
    const addSubjectForm = document.getElementById('addSubjectForm');
    const addSubjectSemesterIdInput = document.getElementById('addSubjectSemesterId');
    const addNameInput = document.getElementById('addSubjectName');
    const addProfInput = document.getElementById('addSubjectProfessor');
    const addCreditsInput = document.getElementById('addSubjectCredits');
    const addTimeSlotContainer = document.getElementById('addTimeSlotContainer');
    const addMoreTimeSlotBtn = document.getElementById('addMoreTimeSlotBtn');
    const saveNewSubjectBtn = document.getElementById('saveNewSubjectBtn');

    const editSubjectModal = document.getElementById('editSubjectModal');
    const editSubjectIdInput = document.getElementById('editSubjectId');
    const editNameInput = document.getElementById('editSubjectName');
    const editProfInput = document.getElementById('editSubjectProfessor');
    const editCreditsInput = document.getElementById('editSubjectCredits');
    const editGradeInput = document.getElementById('editSubjectGrade');
    const editTimeSlotContainer = document.getElementById('editTimeSlotContainer');
    const editAddTimeSlotBtn = document.getElementById('editAddTimeSlotBtn');
    const updateSubjectBtn = document.getElementById('updateSubjectBtn');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');

    const allWeeksModal = document.getElementById('allWeeksModal');


    // --- 1. 초기화 ---
    // [수정됨] 요구사항 2 반영: 현재 날짜 기준 학기 로드
    async function initializePage() {
        setupEventListeners();
        await loadAllSemesters(); // 모든 학기 목록 로드 및 드롭다운 채우기 (기존 유지)

        // Request 2: 페이지 로드 시 학기 ID 없이 API 호출하여 기본(현재 날짜 기준) 학기 로드
        try {
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">기본 시간표 로딩 중...</td></tr>`;
            const response = await fetch('/api/timetable-data'); // semester_id 없이 호출
            if (!response.ok) throw new Error(`기본 시간표 로드 실패 (${response.status})`);
            const data = await response.json();

            if (data.semester && data.semester.id) {
                // 성공적으로 기본 학기 정보를 받아왔다면
                currentSemesterId = data.semester.id;
                currentSemesterInfo = data.semester;
                currentSubjects = data.subjects || [];

                // 드롭다운에서 해당 학기 선택
                if (semesterSelect) semesterSelect.value = currentSemesterId;

                // 과목 메모 파싱 (loadTimetableForSemester와 동일)
                currentSubjects.forEach(s => {
                    if (typeof s.memo === 'string') { try { s.memo = JSON.parse(s.memo); } catch(e) { s.memo = {note: '', todos: []}; } }
                    if (!s.memo || typeof s.memo !== 'object') s.memo = {note: '', todos: []};
                    if (!Array.isArray(s.memo.todos)) s.memo.todos = [];
                    if (typeof s.memo.note !== 'string') s.memo.note = '';
                });

                // UI 렌더링
                renderTimetableGrid(currentSubjects);
                renderTodoSummary(currentSubjects);
                renderSubjectDetailsList(currentSubjects);
                resetWeeklyDetailsPanel(); // 초기에는 주차별 정보 리셋
                addSubjectBtn.disabled = false; // 새 과목 추가 버튼 활성화

                // 학점 통계 로드
                await loadGpaStats();

            } else if (allSemesters.length > 0) {
                 // 기본 학기 로드 실패했지만, 다른 학기 목록이 있다면 최신 학기 로드 시도 (Fallback)
                 console.warn("기본 학기 로드 실패 또는 학기 정보 없음. 최신 학기로 대체합니다.");
                 currentSemesterId = allSemesters[0].id; // 가장 첫 번째 (최신) 학기 ID
                 if (semesterSelect) semesterSelect.value = currentSemesterId;
                 await loadTimetableForSemester(currentSemesterId); // 해당 학기 시간표 로드

            } else {
                 // 학기 목록 자체가 없을 경우
                 throw new Error("등록된 학기가 없습니다.");
            }

        } catch (error) {
            // 초기 로드 실패 시 UI 처리
            console.error("초기 시간표 로드 실패:", error);
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">${error.message}</td></tr>`;
            if(subjectDetailsListUl) subjectDetailsListUl.innerHTML = `<li class="subject-details-empty">${error.message}</li>`;
            todoSummaryList.innerHTML = `<p class="todo-summary-empty">${error.message}</p>`;
            addSubjectBtn.disabled = true;
            resetWeeklyDetailsPanel(); // 주차별 정보 패널 비활성화
        }

        // GPA 통계 로드 (현재 학점 계산 포함) - 학기 로드 후 실행
        loadGpaStats();
        // 주차별 정보 초기화 (선택된 과목 없음 상태)
        updateWeekView();
    }


    // --- 2. 이벤트 리스너 설정 ---
    function setupEventListeners() {
        if (semesterSelect) semesterSelect.addEventListener('change', handleSemesterChange);
        if (addSubjectBtn) addSubjectBtn.addEventListener('click', openAddSubjectModal);

        if (editGoalBtn) editGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'flex'; editGoalBtn.style.display = 'none'; });
        if (cancelGoalBtn) cancelGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'none'; editGoalBtn.style.display = 'inline-block'; });
        if (saveGoalBtn) saveGoalBtn.addEventListener('click', saveCreditGoal);
        if (refreshGpaChartBtn) refreshGpaChartBtn.addEventListener('click', loadGpaStats);

        if (addMoreTimeSlotBtn) addMoreTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, addTimeSlotContainer));
        if (saveNewSubjectBtn) saveNewSubjectBtn.addEventListener('click', saveNewSubject);
        if (addSubjectModal) addSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => addSubjectModal.classList.remove('active')));

        if (editAddTimeSlotBtn) editAddTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, editTimeSlotContainer));
        if (updateSubjectBtn) updateSubjectBtn.addEventListener('click', updateSubject);
        if (deleteSubjectBtn) deleteSubjectBtn.addEventListener('click', deleteSubject);
        if (editSubjectModal) editSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => editSubjectModal.classList.remove('active')));

        if (prevWeekBtn) prevWeekBtn.addEventListener('click', () => changeWeek(-1));
        if (nextWeekBtn) nextWeekBtn.addEventListener('click', () => changeWeek(1));
        if (weeklyAddTodoBtn) weeklyAddTodoBtn.addEventListener('click', addWeeklyTodoItem);
        if (weeklyNewTodoInput) weeklyNewTodoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addWeeklyTodoItem();
            }
        });
        if (saveWeeklyMemoTodoBtn) saveWeeklyMemoTodoBtn.addEventListener('click', saveWeeklyMemoTodo);

        if (viewAllWeeksBtn) viewAllWeeksBtn.addEventListener('click', openAllWeeksModal);
        if (allWeeksModal) allWeeksModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => allWeeksModal.classList.remove('active')));
    }

    // --- 3. 데이터 로딩 (API) ---
    async function loadAllSemesters() {
        try {
            const response = await fetch('/api/semesters');
            if (!response.ok) throw new Error('학기 목록 로드 실패');
            allSemesters = await response.json(); // 백엔드에서 이미 최신순 정렬됨
            populateSemesterDropdown();
        } catch (error) {
            console.error(error);
            if (semesterSelect) semesterSelect.innerHTML = `<option value="">${error.message}</option>`;
        }
    }

    async function handleSemesterChange() {
        if (!semesterSelect) return;
        const selectedId = parseInt(semesterSelect.value, 10);
        if (selectedId && selectedId !== currentSemesterId) {
            currentSemesterId = selectedId;
            await loadTimetableForSemester(currentSemesterId);
            selectedSubjectForDetails = null; // 학기 변경 시 선택된 과목 초기화
            resetWeeklyDetailsPanel(); // 주차별 정보 패널 초기화
            // loadGpaStats(); // 학기 변경 시 GPA 통계 다시 로드할 필요 없음 (전체 통계이므로)
        }
    }


    async function loadTimetableForSemester(semesterId) {
        if (!semesterId) {
            clearTimetableAndTodos();
            resetSubjectDetailsPanel();
            resetWeeklyDetailsPanel();
            currentSemesterInfo = null; // 학기 정보 초기화
            if (addSubjectBtn) addSubjectBtn.disabled = true; // 학기 없으면 추가 불가
            return;
        }
        if (timetableBody) timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">시간표 로딩 중...</td></tr>`;
        if (subjectDetailsListUl) subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">과목 목록 로딩 중...</li>';
        if (todoSummaryList) todoSummaryList.innerHTML = '<p class="todo-summary-empty">Todo 로딩 중...</p>'; // Todo 로딩 상태 추가

        try {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error(`시간표 로드 실패 (${response.status})`);
            const data = await response.json();

            // 학기 정보 저장 (Request 3 위해)
            currentSemesterInfo = data.semester;
            currentSubjects = data.subjects || [];

            // 과목 메모 파싱
            currentSubjects.forEach(s => {
                if (typeof s.memo === 'string') {
                    try { s.memo = JSON.parse(s.memo); } catch(e) { s.memo = {note: '', todos: []}; }
                }
                if (!s.memo || typeof s.memo !== 'object') s.memo = {note: '', todos: []};
                if (!Array.isArray(s.memo.todos)) s.memo.todos = [];
                 if (typeof s.memo.note !== 'string') s.memo.note = '';
            });

            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
            renderSubjectDetailsList(currentSubjects);
            resetWeeklyDetailsPanel(); // 과목 선택 전까지 주차별 정보는 초기화
             if (addSubjectBtn) addSubjectBtn.disabled = false; // 학기 로드 성공 시 추가 버튼 활성화

            // 학점 통계 로드
            await loadGpaStats();

        } catch (error) {
            console.error(error);
            clearTimetableAndTodos();
            resetSubjectDetailsPanel(error.message);
            resetWeeklyDetailsPanel();
            currentSemesterInfo = null;
            if (addSubjectBtn) addSubjectBtn.disabled = true;
        }
    }


    // 현재 학기 과목들의 총 학점 직접 계산 (grade 설정 여부와 무관)
    function calculateTotalCreditsFromCurrentSubjects() {
        if (!currentSubjects || currentSubjects.length === 0) return 0;
        return currentSubjects.reduce((total, subject) => {
            const credits = parseInt(subject.credits, 10) || 0;
            return total + credits;
        }, 0);
    }

    async function loadGpaStats() {
        // GPA 관련 DOM 요소 없으면 실행 중지
        if (!gpaChartCanvas || !creditProgressCircle || !overallGpaEl) return;
        try {
            const response = await fetch('/api/gpa-stats');
            if (!response.ok) throw new Error(`GPA 통계 로드 실패 (${response.status})`);
            const statsData = await response.json();

            // 목표 학점은 goalCreditsEl 에서 직접 읽어옴
            const currentGoal = goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130;

            // 백엔드에서 가져온 학점과 현재 학기 학점을 비교하여 더 큰 값 사용
            // (grade가 설정되지 않은 과목도 포함하기 위해)
            const apiCredits = statsData.total_earned_credits || 0;
            const currentSemesterCredits = calculateTotalCreditsFromCurrentSubjects();
            const totalCredits = Math.max(apiCredits, currentSemesterCredits);

            updateCreditProgress(totalCredits, currentGoal);
            if (overallGpaEl) overallGpaEl.textContent = statsData.overall_gpa;

            renderGpaChart(statsData.semesters);
        } catch (error) {
            console.error(error);
            const ctx = gpaChartCanvas ? gpaChartCanvas.getContext('2d') : null;
            if (ctx) {
                ctx.clearRect(0, 0, gpaChartCanvas.width, gpaChartCanvas.height);
                ctx.textAlign = 'center';
                ctx.fillText(error.message, gpaChartCanvas.width / 2, gpaChartCanvas.height / 2);
            }
             // 에러 발생 시 현재 학기 학점으로 계산
             const currentSemesterCredits = calculateTotalCreditsFromCurrentSubjects();
             updateCreditProgress(currentSemesterCredits, goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130);
             if (overallGpaEl) overallGpaEl.textContent = 'N/A';
        }
    }

    // --- 4. 렌더링 함수 ---
    function populateSemesterDropdown() {
        if (!semesterSelect) return;
        semesterSelect.innerHTML = '';
        if (allSemesters.length > 0) {
            allSemesters.forEach(s => {
                const option = new Option(s.name, s.id);
                semesterSelect.add(option);
            });
            // addSubjectBtn 활성화는 초기 로드 로직에서 처리
        } else {
            semesterSelect.innerHTML = '<option value="">학기 없음</option>';
            if (addSubjectBtn) addSubjectBtn.disabled = true;
        }
    }

    // 시간표 그리드 렌더링
    function renderTimetableGrid(subjects) {
        if (!timetableBody) return;
        timetableBody.innerHTML = '';
        subjectColorMap = {}; // 색상 맵 초기화

        let minHour = 9;
        let maxHour = 18;

        // 시간 범위 계산 및 색상 매핑
        if (subjects && subjects.length > 0) {
            let earliestStartHour = 24, latestEndHour = -1; // latestEndHour 초기값 수정
            subjects.forEach((subject, index) => {
                if (!subjectColorMap[subject.id]) {
                    subjectColorMap[subject.id] = subjectColors[index % subjectColors.length];
                }
                subject.timeslots.forEach(ts => {
                    if (ts.start && ts.end) { // 시간 정보 유효성 검사
                        const startH = parseInt(ts.start.split(':')[0]);
                        const endH = parseInt(ts.end.split(':')[0]);
                        const endM = parseInt(ts.end.split(':')[1]);
                        earliestStartHour = Math.min(earliestStartHour, startH);
                        // 종료 시간이 정각이면 그 이전 시간까지만 포함, 아니면 해당 시간 포함
                        latestEndHour = Math.max(latestEndHour, (endM > 0 ? endH : endH - 1));
                    }
                });
            });
            // earliestStartHour가 24가 아니면(즉, 유효한 시작 시간이 있으면) minHour 업데이트
            if (earliestStartHour < 24) minHour = Math.min(minHour, earliestStartHour);
            // latestEndHour가 0보다 크면(즉, 유효한 종료 시간이 있으면) maxHour 업데이트
            if (latestEndHour >= 0) maxHour = Math.max(maxHour, latestEndHour + 1); // +1은 해당 시간대까지 포함하기 위함
            else if (earliestStartHour < 24) maxHour = Math.max(maxHour, earliestStartHour + 1); // 시작 시간만 있으면 최소 1시간 표시
        }

        // 시간표 행 생성
        for (let h = minHour; h <= maxHour; h++) {
            const hourStr = String(h).padStart(2, '0');
            const row = document.createElement('tr');
            row.setAttribute('data-hour', hourStr);
            row.innerHTML = `<td>${hourStr}:00</td><td data-day="1"></td><td data-day="2"></td><td data-day="3"></td><td data-day="4"></td><td data-day="5"></td>`;
            timetableBody.appendChild(row);
        }

        // 슬롯 배치 또는 빈 메시지 표시
        if (subjects.length > 0) {
            positionTimetableSlots(subjects);
        } else {
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">이번 학기에 등록된 과목이 없습니다.</td></tr>`;
        }
    }

    // 시간표 슬롯 배치
    function positionTimetableSlots(subjects) {
         if (!timetableBody) return;
        requestAnimationFrame(() => { // DOM 렌더링 후 실행 보장
            const firstRowCell = timetableBody.querySelector('td[data-day="1"]');
            if (!firstRowCell) { return; } // 셀 없으면 중단
            const cellHeight = firstRowCell.offsetHeight; // 셀 높이 측정
            if (!cellHeight || cellHeight <= 0) { // 높이 0이면 잠시 후 재시도 (렌더링 지연 문제)
                console.warn("Cell height is 0, retrying slot positioning...");
                setTimeout(() => positionTimetableSlots(subjects), 100);
                return;
            }

            subjects.forEach(subject => {
                const subjectColor = subjectColorMap[subject.id] || 'rgba(165, 0, 52, 0.1)';
                const borderColor = subjectColor.replace('0.1', '0.8'); // 테두리 색상

                subject.timeslots.forEach(ts => {
                     // 시간 정보 유효성 검사 추가
                     if (!ts.start || !ts.end || !ts.start.includes(':') || !ts.end.includes(':')) {
                         console.warn(`Invalid timeslot data for subject ${subject.name}:`, ts);
                         return; // 유효하지 않으면 건너뛰기
                     }

                    const [startH, startM] = ts.start.split(':').map(Number);
                    const [endH, endM] = ts.end.split(':').map(Number);
                    // 슬롯이 시작하는 시간대의 셀 찾기
                    const targetCell = timetableBody.querySelector(`tr[data-hour="${String(startH).padStart(2, '0')}"] td[data-day="${ts.day}"]`);
                    if (!targetCell) { return; } // 해당 셀이 없으면 건너뛰기 (시간 범위 밖)

                    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM); // 총 지속 시간(분)
                    if (durationMinutes <= 0) return; // 지속시간 없으면 건너뛰기

                    const topOffset = (startM / 60) * cellHeight; // 셀 상단에서의 오프셋
                    // 슬롯 높이 계산 (최소 10px), 셀 경계선 고려하여 -2px
                    const slotHeight = Math.max(10, (durationMinutes / 60) * cellHeight - 2);

                    // 슬롯 div 생성 및 스타일 설정
                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'subject-slot';
                    slotDiv.style.top = `${topOffset}px`;
                    slotDiv.style.height = `${slotHeight}px`;
                    slotDiv.style.backgroundColor = subjectColor; // 배경색 적용
                    slotDiv.style.borderLeft = `4px solid ${borderColor}`; // 테두리색 적용

                    // 슬롯 내용 (과목명, 강의실)
                    let innerHTML = `<div class="slot-subject">${subject.name}</div>`;
                    if (slotHeight > 30) innerHTML += `<div class="slot-room">${ts.room || ''}</div>`; // 높이가 충분할 때만 강의실 표시
                    slotDiv.innerHTML = innerHTML;

                    // 클릭 시 수정 모달 열기
                    slotDiv.addEventListener('click', (e) => {
                        e.stopPropagation(); // 이벤트 버블링 방지
                        openEditSubjectModal(subject.id);
                    });
                    targetCell.appendChild(slotDiv); // 셀에 슬롯 추가
                });
            });
        });
    }


    function clearTimetableAndTodos() {
        if (timetableBody) timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">표시할 시간표가 없습니다.</td></tr>`;
        if (todoSummaryList) todoSummaryList.innerHTML = '<p class="todo-summary-empty">학기를 선택해주세요.</p>';
    }

    function renderTodoSummary(subjects) {
        if (!todoSummaryList) return;
        todoSummaryList.innerHTML = '';
        // 메모(note) 또는 할일(todos)이 있는 과목 필터링
        const subjectsWithContent = subjects.filter(s => s.memo && (s.memo.note || (s.memo.todos && s.memo.todos.length > 0)));

        if (subjectsWithContent.length === 0) {
            todoSummaryList.innerHTML = '<p class="todo-summary-empty">이번 학기 메모/Todo가 없습니다.</p>';
            return;
        }

        subjectsWithContent.forEach(subject => {
            const hasNote = subject.memo.note && subject.memo.note.trim() !== '';
            const hasTodos = subject.memo.todos && subject.memo.todos.length > 0;
            const pendingTodos = hasTodos ? subject.memo.todos.filter(t => !t.done) : [];
            const isCompleted = hasTodos && pendingTodos.length === 0;

            const itemDiv = document.createElement('div');
            itemDiv.className = `todo-summary-item ${isCompleted ? 'completed' : ''}`;

            let statusText = '';
            if (hasNote && hasTodos) statusText = `메모 있음 / ${isCompleted ? 'Todo 완료' : `${pendingTodos.length}개 남음`}`;
            else if (hasNote) statusText = '메모 있음';
            else if (hasTodos) statusText = isCompleted ? 'Todo 완료' : `${pendingTodos.length}개 남음`;

            itemDiv.innerHTML = `
                <div class="todo-subject">${subject.name} (${statusText})</div>
                ${hasTodos ? `
                <ul class="todo-list">
                    ${subject.memo.todos.map(todo => `<li class="todo-list-item ${todo.done ? 'done' : 'pending'}"><i class="fas ${todo.done ? 'fa-check-square' : 'fa-square'}"></i> ${todo.task}</li>`).join('')}
                </ul>` : ''}
                ${hasNote ? `<div class="todo-note-preview"><i class="fas fa-sticky-note"></i> ${subject.memo.note.substring(0, 50)}${subject.memo.note.length > 50 ? '...' : ''}</div>` : ''}`; // 메모 미리보기 추가

            todoSummaryList.appendChild(itemDiv);
        });
    }

    // GPA 차트 렌더링
    function renderGpaChart(semesters) {
        if (!gpaChartCanvas) return;
        if (gpaChartInstance) gpaChartInstance.destroy(); // 기존 차트 파괴
        gpaChartInstance = new Chart(gpaChartCanvas, {
            type: 'line', // 라인 차트
            data: {
                labels: semesters.map(s => s.semester_name.replace('년 ', '.')), // 라벨 (예: "2024.1학기")
                datasets: [{
                    label: '학기별 평점(GPA)',
                    data: semesters.map(s => s.gpa), // 데이터
                    backgroundColor: 'rgba(165, 0, 52, 0.1)', // 영역 색상
                    borderColor: 'rgba(165, 0, 52, 1)', // 라인 색상
                    borderWidth: 2,
                    tension: 0.1, // 라인 곡률
                    fill: true // 영역 채우기
                }]
            },
            options: {
                responsive: true, // 반응형
                maintainAspectRatio: false, // 비율 유지 안함
                scales: { y: { beginAtZero: true, max: 4.5 } }, // Y축 설정 (0 ~ 4.5)
                plugins: { tooltip: { mode: 'index', intersect: false } } // 툴팁 설정
            }
        });
    }

    // 과목 목록 렌더링 (오른쪽 사이드바)
    function renderSubjectDetailsList(subjects) {
        if (!subjectDetailsListUl) return;
        subjectDetailsListUl.innerHTML = ''; // 목록 초기화
        if (!subjects || subjects.length === 0) {
            subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">이 학기에 등록된 과목이 없습니다.</li>';
            return;
        }
        subjects.forEach(subject => {
            const li = document.createElement('li');
            li.className = 'subject-details-item';
            li.setAttribute('data-subject-id', subject.id);
            // 과목 정보 및 등급 선택 드롭다운 HTML
            li.innerHTML = `
                <div class="subject-info">
                    <span class="subject-name">${subject.name}</span>
                    <span class="subject-prof">${subject.professor || ''} (${subject.credits}학점)</span>
                </div>
                <div class="subject-grade">
                    <select class="grade-select" data-subject-id="${subject.id}">
                        <option value="Not Set" ${!subject.grade || subject.grade === 'Not Set' ? 'selected' : ''}>미설정</option>
                        <option value="A+" ${subject.grade === 'A+' ? 'selected' : ''}>A+</option>
                        <option value="A0" ${subject.grade === 'A0' ? 'selected' : ''}>A0</option>
                        <option value="B+" ${subject.grade === 'B+' ? 'selected' : ''}>B+</option>
                        <option value="B0" ${subject.grade === 'B0' ? 'selected' : ''}>B0</option>
                        <option value="C+" ${subject.grade === 'C+' ? 'selected' : ''}>C+</option>
                        <option value="C0" ${subject.grade === 'C0' ? 'selected' : ''}>C0</option>
                        <option value="D+" ${subject.grade === 'D+' ? 'selected' : ''}>D+</option>
                        <option value="D0" ${subject.grade === 'D0' ? 'selected' : ''}>D0</option>
                        <option value="F" ${subject.grade === 'F' ? 'selected' : ''}>F</option>
                        <option value="P" ${subject.grade === 'P' ? 'selected' : ''}>Pass</option>
                    </select>
                </div>
            `;
            // 클릭 시 해당 과목 선택 및 주차별 정보 로드
            li.addEventListener('click', () => {
                 if (subjectDetailsListUl) subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
                 li.classList.add('selected');
                 selectSubjectForDetails(subject.id);
            });
            // 등급 변경 시 이벤트 처리 (버블링 방지)
             const gradeSelect = li.querySelector('.grade-select');
             if (gradeSelect) {
                gradeSelect.addEventListener('change', handleGradeChange);
                gradeSelect.addEventListener('click', (e) => e.stopPropagation());
             }

            subjectDetailsListUl.appendChild(li);
        });
    }

     // 과목 선택 시 처리 (Request 3 수정)
     function selectSubjectForDetails(subjectId) {
         selectedSubjectForDetails = currentSubjects.find(s => s.id === subjectId);
         if (selectedSubjectForDetails && weeklyDetailsTitle) {
             weeklyDetailsTitle.innerHTML = `<i class="fas fa-calendar-week"></i> 주차별 정보 (${selectedSubjectForDetails.name})`;

             // Request 3: 현재 날짜 기준 주차 계산
             let calculatedWeek = 1;

             // 학기 정보에서 시작일 가져오기
             if (currentSemesterInfo && currentSemesterInfo.start_date) {
                 const startDate = new Date(currentSemesterInfo.start_date);
                 calculatedWeek = calculateCurrentWeekNumber(startDate);
                 console.log(`[Week Calculation] Semester start: ${currentSemesterInfo.start_date}, Calculated week: ${calculatedWeek}`);
             } else {
                 // 학기 시작일이 없으면 학기 이름에서 추정 (2024-2학기 형식)
                 if (currentSemesterInfo && currentSemesterInfo.name) {
                     const estimatedStartDate = estimateSemesterStartDate(currentSemesterInfo.name);
                     if (estimatedStartDate) {
                         calculatedWeek = calculateCurrentWeekNumber(estimatedStartDate);
                         console.log(`[Week Calculation] Estimated start from semester name '${currentSemesterInfo.name}': ${estimatedStartDate.toISOString().split('T')[0]}, Calculated week: ${calculatedWeek}`);
                     }
                 } else {
                     console.warn('[Week Calculation] No semester info or start_date available, using week 1');
                 }
             }

             currentWeek = calculatedWeek; // 계산된 주차 또는 기본값 1로 설정

             updateWeekView(); // 계산된 주차 정보 로드 및 UI 업데이트
             enableWeeklyDetailsPanel(); // 패널 활성화
         } else {
             resetWeeklyDetailsPanel(); // 과목 없거나 학기 정보 없으면 리셋
         }
     }

     // 등급 변경 처리
     async function handleGradeChange(event) {
         const selectElement = event.target;
         const subjectId = parseInt(selectElement.dataset.subjectId, 10);
         const newGrade = selectElement.value;
         const subject = currentSubjects.find(s => s.id === subjectId);
         if (!subject) return;

         // 등급 변경 시 로컬 데이터 즉시 업데이트
         subject.grade = newGrade;
         const subjectMemo = subject.memo || { note: '', todos: [] }; // 메모 정보 가져오기

         // 옵티미스틱 UI 업데이트: 서버 응답 기다리지 않고 바로 GPA 재계산 (선택적)
         // calculateAndDisplayLocalGPA();

         try {
             // 서버에 업데이트 요청 (메모 포함)
             const timeslotsData = subject.timeslots.map(ts => ({
                day: ts.day, start: ts.start, end: ts.end, room: ts.room
             }));
             const response = await fetch(`/api/subjects/${subjectId}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                    name: subject.name, professor: subject.professor, credits: subject.credits,
                    grade: newGrade, timeslots: timeslotsData, memo: subjectMemo // 메모 함께 전송
                 })
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message);

             // 서버 업데이트 성공 후, 전체 GPA 통계 다시 로드 (정확성 보장)
             loadGpaStats();

         } catch (error) {
             alert(`등급 업데이트 실패: ${error.message}`);
             // 실패 시 원래 등급으로 되돌리기 (선택적)
             // selectElement.value = subject.grade;
             // calculateAndDisplayLocalGPA(); // 롤백 후 GPA 다시 계산
         }
     }

     // 주차 변경 (-1 또는 1)
     function changeWeek(delta) {
         const newWeek = currentWeek + delta;
         if (newWeek >= 1 && newWeek <= TOTAL_WEEKS) { // 1~16주차 범위 확인
             currentWeek = newWeek;
             updateWeekView(); // 변경된 주차 정보 로드
         }
     }

     // 주차별 정보 UI 업데이트 및 데이터 로드 트리거
     async function updateWeekView() {
         if (prevWeekBtn) prevWeekBtn.disabled = (currentWeek === 1); // 이전 버튼 비활성화 (1주차)
         if (nextWeekBtn) nextWeekBtn.disabled = (currentWeek === TOTAL_WEEKS); // 다음 버튼 비활성화 (16주차)

         if (selectedSubjectForDetails) {
             await loadWeeklyMemoTodo(); // 선택된 과목 있으면 해당 주차 데이터 로드
         } else {
            if (currentWeekDisplay) currentWeekDisplay.textContent = '주차 선택'; // 과목 없으면 기본 텍스트
             resetWeeklyDetailsPanel(); // 패널 리셋
         }
     }

     // 특정 주차의 메모/Todo 데이터 로드 (API 호출)
     async function loadWeeklyMemoTodo() {
         if (!selectedSubjectForDetails || !weeklyMemoText || !weeklyTodoListUl) return;
         // 로딩 상태 UI 설정
         weeklyMemoText.disabled = true;
         weeklyMemoText.value = '로딩 중...';
         weeklyTodoListUl.innerHTML = '<li class="todo-empty">로딩 중...</li>';
         disableWeeklyDetailsPanel(); // 입력 필드 비활성화

         try {
             const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`);
             if (!response.ok) throw new Error('주차별 정보 로드 실패');
             const weeklyData = await response.json();
             if (weeklyData.status === 'success') {
                // 성공 시 데이터 저장 및 UI 업데이트
                currentWeeklyData = { note: weeklyData.note || '', todos: weeklyData.todos || [] };
                if (currentWeekDisplay) currentWeekDisplay.textContent = `${weeklyData.week_date_str} (${currentWeek}주차)`; // 날짜 범위 표시
                weeklyMemoText.value = currentWeeklyData.note;
                renderWeeklyTodoList(currentWeeklyData.todos);
                if (weeklyMemoSubjectName) weeklyMemoSubjectName.textContent = selectedSubjectForDetails.name; // 과목 이름 표시
                if (weeklyTodoSubjectName) weeklyTodoSubjectName.textContent = selectedSubjectForDetails.name;
                enableWeeklyDetailsPanel(); // 입력 필드 활성화
             } else {
                throw new Error(weeklyData.message || '데이터 로드 실패');
             }
         } catch (error) {
             // 실패 시 에러 메시지 표시
             console.error(`Error loading week ${currentWeek} data:`, error);
             if (currentWeekDisplay) currentWeekDisplay.textContent = `${currentWeek}주차 (로드 실패)`;
             weeklyMemoText.value = '주차 정보 로드에 실패했습니다.';
             weeklyTodoListUl.innerHTML = `<li class="todo-empty">${error.message}</li>`;
             disableWeeklyDetailsPanel();
         }
     }

     // 주차별 Todo 목록 렌더링
     function renderWeeklyTodoList(todos) {
        if (!weeklyTodoListUl) return;
         weeklyTodoListUl.innerHTML = ''; // 목록 초기화
         if (!todos || todos.length === 0) {
             weeklyTodoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
             return;
         }
         currentWeeklyData.todos = todos; // 로컬 데이터 업데이트

         todos.forEach((todo, index) => {
             const li = document.createElement('li');
             li.className = todo.done ? 'todo-item done' : 'todo-item';
             const todoId = `weekly-todo-${currentWeek}-${index}-${Date.now()}`; // 고유 ID 생성
             // Todo 항목 HTML (체크박스, 라벨, 삭제 버튼)
             li.innerHTML = `
                 <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
                 <label for="${todoId}" class="todo-label">${todo.task}</label>
                 <span class="todo-delete-btn" data-index="${index}">&times;</span>
             `;
             // 체크박스 변경 시: 로컬 데이터 업데이트, UI 변경, 저장 버튼 활성화
             li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                 if (currentWeeklyData.todos && currentWeeklyData.todos[index]) {
                     currentWeeklyData.todos[index].done = e.target.checked;
                     li.classList.toggle('done', e.target.checked);
                     if (saveWeeklyMemoTodoBtn) {
                        saveWeeklyMemoTodoBtn.disabled = false;
                        saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
                     }
                 }
             });
             // 삭제 버튼 클릭 시: 로컬 데이터에서 삭제, UI 다시 렌더링, 저장 버튼 활성화
             li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
                 if (currentWeeklyData.todos) {
                     const indexToRemove = parseInt(e.target.dataset.index, 10);
                     currentWeeklyData.todos.splice(indexToRemove, 1);
                     renderWeeklyTodoList(currentWeeklyData.todos); // 목록 다시 렌더링
                     if (saveWeeklyMemoTodoBtn) {
                        saveWeeklyMemoTodoBtn.disabled = false;
                        saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
                     }
                 }
             });
             weeklyTodoListUl.appendChild(li);
         });
     }

     // 주차별 Todo 항목 추가
     function addWeeklyTodoItem() {
        if (!weeklyNewTodoInput || !selectedSubjectForDetails) return;
         const taskText = weeklyNewTodoInput.value.trim();
         if (taskText === '') return; // 내용 없으면 무시

         const newTodo = { task: taskText, done: false }; // 새 Todo 객체
         if (weeklyTodoListUl) {
            const emptyMsg = weeklyTodoListUl.querySelector('.todo-empty');
            if (emptyMsg) weeklyTodoListUl.innerHTML = ''; // "없음" 메시지 제거
         }
         if (!currentWeeklyData.todos) currentWeeklyData.todos = []; // 배열 초기화
         currentWeeklyData.todos.push(newTodo); // 로컬 데이터에 추가
         renderWeeklyTodoList(currentWeeklyData.todos); // 목록 다시 렌더링
         weeklyNewTodoInput.value = ''; // 입력 필드 비우기
         weeklyNewTodoInput.focus(); // 입력 필드 포커스
         if (saveWeeklyMemoTodoBtn) {
            saveWeeklyMemoTodoBtn.disabled = false; // 저장 버튼 활성화
            saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
         }
     }

     // 주차별 메모/Todo 저장 (API 호출)
     async function saveWeeklyMemoTodo() {
         if (!selectedSubjectForDetails) {
             alert("과목을 먼저 선택해주세요.");
             return;
         }
         currentWeeklyData.note = weeklyMemoText ? weeklyMemoText.value.trim() : ""; // 현재 메모 내용 가져오기
         // 저장 버튼 상태 변경 (로딩)
         if (saveWeeklyMemoTodoBtn) {
            saveWeeklyMemoTodoBtn.disabled = true;
            saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
         }

         try {
             // 서버에 PUT 요청으로 데이터 전송
             const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(currentWeeklyData) // 현재 메모와 Todo 목록 전송
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message || '저장 실패');

             // 성공 시 버튼 상태 변경 (완료) 후 잠시 뒤 원래대로 복구
             if (saveWeeklyMemoTodoBtn) {
                saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-check"></i> 저장 완료!';
                setTimeout(() => {
                     if (saveWeeklyMemoTodoBtn) { // setTimeout 콜백 내에서 다시 확인
                        saveWeeklyMemoTodoBtn.disabled = false;
                        saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
                     }
                }, 2000);
             }
         } catch (error) {
             // 실패 시 에러 메시지 표시 및 버튼 상태 변경 (실패)
             console.error("Failed to save weekly memo/todo:", error);
             alert(`주차별 정보 저장 실패: ${error.message}`);
             if (saveWeeklyMemoTodoBtn) {
                saveWeeklyMemoTodoBtn.disabled = false;
                saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-times"></i> 저장 실패';
             }
         }
     }

     // '모든 주차 모아보기' 모달 열기 (Request 4 수정)
     async function openAllWeeksModal() {
        if (!selectedSubjectForDetails || !allWeeksModal) {
            alert("먼저 과목을 선택해주세요.");
            return;
        }

        const modalTitle = allWeeksModal.querySelector('.modal-header h3');
        const accordionContainer = allWeeksModal.querySelector('#allWeeksAccordion');

        if (modalTitle) modalTitle.textContent = `${selectedSubjectForDetails.name} - 전체 주차 정보`;
        if (accordionContainer) accordionContainer.innerHTML = '<div class="loading-spinner-small"></div>'; // 로딩 스피너 표시
        allWeeksModal.classList.add('active'); // 모달 활성화

        try {
            // API 호출
            const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/all-weeks`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            // Request 4 Fix: result.data가 배열인지 확인
            if (Array.isArray(result.data)) {
                renderAllWeeksAccordion(result.data, accordionContainer); // 배열이면 렌더링 함수 호출
            } else {
                console.error("API response data is not an array:", result.data);
                throw new Error("데이터 형식이 올바르지 않습니다.");
            }
        } catch (error) {
            // 실패 시 에러 메시지 표시
             if (accordionContainer) accordionContainer.innerHTML = `<p class="todo-summary-empty">${error.message}</p>`;
        }
     }

    // '모든 주차 모아보기' 아코디언 렌더링 (Request 4 수정)
     function renderAllWeeksAccordion(allWeeksData, container) {
         if (!container) return;
        container.innerHTML = ''; // 컨테이너 초기화

        // Request 4 Fix: allWeeksData가 배열인지 다시 확인하고 .some 사용
        const hasAnyContent = Array.isArray(allWeeksData) && allWeeksData.some(week => (week.note && week.note.trim()) || (week.todos && week.todos.length > 0));

        if (!hasAnyContent) {
            container.innerHTML = `<p class="todo-summary-empty">모든 주차에 기록된 정보가 없습니다.</p>`;
            return;
        }

        // 주차별 데이터 반복 처리
        allWeeksData.forEach(week => {
             const weekNote = week.note ? week.note.trim() : '';
             const weekTodos = week.todos || [];
            // 내용이 없으면 해당 주차는 건너뛰기
            if (!weekNote && weekTodos.length === 0) return;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'accordion-item';
            // 아코디언 헤더 (주차, 날짜 범위) 및 내용 (메모, Todo 목록) HTML 생성
            itemDiv.innerHTML = `
                <div class="accordion-header">
                    <span class="week-title">${week.week_number}주차 (${week.date_range})</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="accordion-content" style="padding: 16px;"> ${weekNote ? `<h4><i class="fas fa-sticky-note"></i> 메모</h4><p style="white-space: pre-wrap; margin-bottom: 10px;">${weekNote}</p>` : ''}
                    ${weekTodos.length > 0 ? `
                        <h4 style="margin-top: ${weekNote ? '10px' : '0'};"><i class="fas fa-check-square"></i> Todo</h4>
                        <ul class="memo-todo-list" style="border: none; background: none; max-height: none; padding-left: 5px;">
                            ${weekTodos.map(todo => `<li class="todo-item ${todo.done ? 'done' : ''}" style="padding: 4px 0; border: none; align-items: flex-start;">
                                <i class="fas ${todo.done ? 'fa-check-square' : 'fa-square'}" style="margin-top: 2px; margin-right: 8px; color: ${todo.done ? 'var(--color-success)' : 'var(--text-secondary)'};"></i>
                                <span class="todo-label" style="line-height: 1.4;">${todo.task}</span>
                               </li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `;
            container.appendChild(itemDiv); // 컨테이너에 추가
        });

        // 아코디언 토글 이벤트 리스너 추가
        container.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const item = header.parentElement;
                const isActive = item.classList.contains('active');

                // 모든 활성 아코디언 닫기 (선택적: 하나만 열리게 하려면)
                // container.querySelectorAll('.accordion-item.active').forEach(activeItem => {
                //     if (activeItem !== item) {
                //         activeItem.classList.remove('active');
                //         activeItem.querySelector('.accordion-content').style.maxHeight = null;
                //     }
                // });

                // 현재 클릭된 아코디언 토글
                item.classList.toggle('active', !isActive);
                if (content) { // content 요소가 있는지 확인
                    if (!isActive) {
                        content.style.maxHeight = content.scrollHeight + "px"; // 열기
                    } else {
                        content.style.maxHeight = null; // 닫기
                    }
                }
            });
        });
     }


     // 오른쪽 과목 상세 패널 리셋
     function resetSubjectDetailsPanel(message = "학기를 선택해주세요.") {
          if(subjectDetailsListUl) subjectDetailsListUl.innerHTML = `<li class="subject-details-empty">${message}</li>`;
     }

     // 주차별 정보 패널 리셋 및 비활성화
     function resetWeeklyDetailsPanel() {
         if (weeklyDetailsTitle) weeklyDetailsTitle.innerHTML = '<i class="fas fa-calendar-week"></i> 주차별 정보';
         if (weeklyMemoSubjectName) weeklyMemoSubjectName.textContent = "과목 선택";
         if (weeklyTodoSubjectName) weeklyTodoSubjectName.textContent = "과목 선택";
         if (weeklyMemoText) weeklyMemoText.value = '';
         if (weeklyTodoListUl) weeklyTodoListUl.innerHTML = '<li class="todo-empty">과목을 선택해주세요.</li>';
         if (weeklyNewTodoInput) weeklyNewTodoInput.value = '';

         currentWeek = 1; // 주차를 1로 리셋
         currentWeeklyData = { note: "", todos: [] }; // 데이터 리셋
         if (currentWeekDisplay) currentWeekDisplay.textContent = '주차 선택'; // 주차 표시 리셋
         if (prevWeekBtn) prevWeekBtn.disabled = true; // 이전 버튼 비활성화
         if (nextWeekBtn) nextWeekBtn.disabled = (TOTAL_WEEKS <= 1); // 다음 버튼 상태 설정
         disableWeeklyDetailsPanel(); // 입력 필드 비활성화
         selectedSubjectForDetails = null; // 선택된 과목 없음
         // 과목 목록에서 'selected' 클래스 제거
         if(subjectDetailsListUl) subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
     }

     // 주차별 정보 패널 활성화
     function enableWeeklyDetailsPanel() {
         if (weeklyMemoText) weeklyMemoText.disabled = false;
         if (weeklyNewTodoInput) weeklyNewTodoInput.disabled = false;
         if (weeklyAddTodoBtn) weeklyAddTodoBtn.disabled = false;
         if (saveWeeklyMemoTodoBtn) {
            saveWeeklyMemoTodoBtn.disabled = false;
            saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
         }
     }

     // 주차별 정보 패널 비활성화
     function disableWeeklyDetailsPanel() {
         if (weeklyMemoText) weeklyMemoText.disabled = true;
         if (weeklyNewTodoInput) weeklyNewTodoInput.disabled = true;
         if (weeklyAddTodoBtn) weeklyAddTodoBtn.disabled = true;
         if (saveWeeklyMemoTodoBtn) {
            saveWeeklyMemoTodoBtn.disabled = true;
            saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
         }
     }

    // 학점 진행률 업데이트
    function updateCreditProgress(current, goal) {
         // 관련 DOM 요소 없으면 중단
         if (!currentCreditsEl || !goalCreditsEl || !remainingCreditsEl || !creditPercentageEl) return;
         const remaining = Math.max(0, goal - current); // 남은 학점
         const percentage = (goal > 0) ? Math.min(100, (current / goal) * 100) : 0; // 달성률(%)
         const circumference = 2 * Math.PI * 45; // 원 둘레
         const dashoffset = circumference - (circumference * percentage / 100); // SVG stroke-dashoffset 값 계산
         // DOM 업데이트
         currentCreditsEl.textContent = current;
         goalCreditsEl.textContent = goal;
         remainingCreditsEl.textContent = remaining;
         creditPercentageEl.textContent = `${Math.round(percentage)}%`;
         if (creditProgressCircle) creditProgressCircle.style.strokeDashoffset = dashoffset; // SVG 업데이트
    }

    // 목표 학점 저장
    async function saveCreditGoal() {
         // 관련 DOM 요소 없으면 중단
         if (!newGoalInput || !saveGoalBtn || !currentCreditsEl || !editGoalForm || !editGoalBtn) return;
        const newGoal = parseInt(newGoalInput.value, 10);
        if (isNaN(newGoal) || newGoal <= 0) { alert('유효한 학점을 입력하세요.'); return; }
        saveGoalBtn.disabled = true; // 저장 버튼 비활성화
        try {
            // API 호출
            const response = await fetch('/api/credits/goal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: newGoal }) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            // 성공 시 UI 업데이트
            updateCreditProgress(parseInt(currentCreditsEl.textContent, 10), result.new_goal);
            editGoalForm.style.display = 'none'; // 입력 폼 숨기기
            editGoalBtn.style.display = 'inline-block'; // 수정 버튼 보이기
        } catch (error) {
            alert(`목표 학점 저장 실패: ${error.message}`);
        } finally {
            saveGoalBtn.disabled = false; // 저장 버튼 다시 활성화
        }
    }

    // 새 과목 추가 모달 열기
    function openAddSubjectModal() {
        if (!currentSemesterId) { alert("과목을 추가할 학기를 선택해주세요."); return; }
        if (!addSubjectModal || !addSubjectForm || !addSubjectSemesterIdInput || !addTimeSlotContainer) return;
        addSubjectForm.reset(); // 폼 리셋
        addSubjectSemesterIdInput.value = currentSemesterId; // 현재 학기 ID 설정
        addTimeSlotContainer.innerHTML = ''; // 시간 슬롯 초기화
        createTimeSlotEntry(null, addTimeSlotContainer); // 기본 시간 슬롯 하나 추가
        addSubjectModal.classList.add('active'); // 모달 활성화
    }

    // 과목 수정 모달 열기
    function openEditSubjectModal(subjectId) {
        if (!editSubjectModal || !editSubjectIdInput || !editNameInput || !editProfInput || !editCreditsInput || !editGradeInput || !editTimeSlotContainer) return;
        const subject = currentSubjects.find(s => s.id === subjectId); // 해당 과목 찾기
        if (!subject) return;
        // 모달 폼에 과목 정보 채우기
        editSubjectIdInput.value = subject.id;
        editNameInput.value = subject.name;
        editProfInput.value = subject.professor || ''; // null일 경우 빈 문자열
        editCreditsInput.value = subject.credits;
        editGradeInput.value = subject.grade || "Not Set"; // null일 경우 "Not Set"
        editTimeSlotContainer.innerHTML = ''; // 시간 슬롯 초기화
        if (subject.timeslots && subject.timeslots.length > 0) { // 기존 시간 슬롯 추가
            subject.timeslots.forEach(ts => createTimeSlotEntry(ts, editTimeSlotContainer));
        } else {
            createTimeSlotEntry(null, editTimeSlotContainer); // 없으면 기본 슬롯 하나 추가
        }
        editSubjectModal.classList.add('active'); // 모달 활성화
    }

    // 시간/장소 입력 슬롯 생성 (추가/수정 모달 공통 사용)
    function createTimeSlotEntry(timeslot, container) {
        if (!container) return;
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeslot-entry';
        // 요일, 시작시간, 종료시간, 강의실 입력 필드 HTML
        entryDiv.innerHTML = `
            <select name="day">
                <option value="1" ${timeslot && timeslot.day == 1 ? 'selected' : ''}>월</option>
                <option value="2" ${timeslot && timeslot.day == 2 ? 'selected' : ''}>화</option>
                <option value="3" ${timeslot && timeslot.day == 3 ? 'selected' : ''}>수</option>
                <option value="4" ${timeslot && timeslot.day == 4 ? 'selected' : ''}>목</option>
                <option value="5" ${timeslot && timeslot.day == 5 ? 'selected' : ''}>금</option>
            </select>
            <input type="time" name="start_time" value="${timeslot ? (timeslot.start || '09:00') : '09:00'}">
            <input type="time" name="end_time" value="${timeslot ? (timeslot.end || '10:15') : '10:15'}">
            <input type="text" name="room" placeholder="강의실" value="${timeslot ? (timeslot.room || '') : ''}">
            <button type="button" class="timeslot-delete-btn">&times;</button>
        `;
        // 삭제 버튼 이벤트
        entryDiv.querySelector('.timeslot-delete-btn').addEventListener('click', () => entryDiv.remove());
        container.appendChild(entryDiv); // 컨테이너에 슬롯 추가
    }

    // 새 과목 저장 (API 호출)
    async function saveNewSubject() {
         // 관련 DOM 요소 없으면 중단
        if (!addSubjectSemesterIdInput || !addNameInput || !addProfInput || !addCreditsInput || !addTimeSlotContainer || !saveNewSubjectBtn || !addSubjectModal) return;

        // 폼 데이터 수집
        const data = {
            semester_id: parseInt(addSubjectSemesterIdInput.value, 10),
            name: addNameInput.value.trim(),
            professor: addProfInput.value.trim(),
            credits: parseInt(addCreditsInput.value, 10) || 0,
            timeslots: Array.from(addTimeSlotContainer.querySelectorAll('.timeslot-entry')).map(entry => ({
                day: parseInt(entry.querySelector('[name="day"]').value, 10),
                start: entry.querySelector('[name="start_time"]').value,
                end: entry.querySelector('[name="end_time"]').value,
                room: entry.querySelector('[name="room"]').value.trim()
            })).filter(ts => ts.day && ts.start && ts.end) // 유효한 슬롯만 필터링
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; } // 과목명 필수 체크

        saveNewSubjectBtn.disabled = true; // 저장 버튼 비활성화
        try {
            // API 호출
            const response = await fetch('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            addSubjectModal.classList.remove('active'); // 모달 닫기
            await loadTimetableForSemester(currentSemesterId); // 시간표 다시 로드
            await loadGpaStats(); // GPA 통계 다시 로드
        } catch (error) {
            alert(`저장 실패: ${error.message}`);
        } finally {
            saveNewSubjectBtn.disabled = false; // 저장 버튼 활성화
        }
    }

    // 과목 정보 수정 (API 호출)
    async function updateSubject() {
         // 관련 DOM 요소 없으면 중단
         if (!editSubjectIdInput || !editNameInput || !editProfInput || !editCreditsInput || !editGradeInput || !editTimeSlotContainer || !updateSubjectBtn || !editSubjectModal) return;

        const subjectId = editSubjectIdInput.value;
        const subject = currentSubjects.find(s => s.id === parseInt(subjectId, 10));
        if (!subject) return;

        // 수정된 데이터 수집
        const data = {
            name: editNameInput.value.trim(),
            professor: editProfInput.value.trim(),
            credits: parseInt(editCreditsInput.value, 10) || 0,
            grade: editGradeInput.value,
            timeslots: Array.from(editTimeSlotContainer.querySelectorAll('.timeslot-entry')).map(entry => ({
                day: parseInt(entry.querySelector('[name="day"]').value, 10),
                start: entry.querySelector('[name="start_time"]').value,
                end: entry.querySelector('[name="end_time"]').value,
                room: entry.querySelector('[name="room"]').value.trim()
            })).filter(ts => ts.day && ts.start && ts.end),
             memo: subject.memo || { note: '', todos: [] } // 기존 메모 정보 유지
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; } // 과목명 필수

        updateSubjectBtn.disabled = true; // 수정 버튼 비활성화
        try {
            // API 호출
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active'); // 모달 닫기

            // 로컬 데이터 업데이트
            const updatedSubjectData = result.subject;
            const index = currentSubjects.findIndex(s => s.id === updatedSubjectData.id);
            if (index !== -1) {
                 // 메모 파싱 로직 추가
                let memo = updatedSubjectData.memo;
                if (typeof memo === 'string') {
                    try { memo = JSON.parse(memo); } catch(e) { memo = { note: '', todos: [] }; }
                }
                if (!memo || typeof memo !== 'object') memo = { note: '', todos: [] };
                if (!Array.isArray(memo.todos)) memo.todos = [];
                if (typeof memo.note !== 'string') memo.note = '';

                currentSubjects[index] = { ...updatedSubjectData, memo: memo }; // 파싱된 메모로 업데이트
            }

            // UI 다시 렌더링
            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
            renderSubjectDetailsList(currentSubjects);

            // 주차별 정보 패널 업데이트 (선택된 과목이면)
            if (selectedSubjectForDetails && selectedSubjectForDetails.id === updatedSubjectData.id) {
                 selectSubjectForDetails(updatedSubjectData.id); // 업데이트된 과목 정보로 다시 선택
            }
            await loadGpaStats(); // GPA 통계 다시 로드

        } catch (error) {
            alert(`수정 실패: ${error.message}`);
        } finally {
            updateSubjectBtn.disabled = false; // 수정 버튼 활성화
        }
    }

    // 과목 삭제 (API 호출)
    async function deleteSubject() {
         // 관련 DOM 요소 없으면 중단
         if (!editSubjectIdInput || !deleteSubjectBtn || !editSubjectModal) return;

        const subjectId = editSubjectIdInput.value;
        if (!subjectId || !confirm('정말로 이 과목을 삭제하시겠습니까? 관련된 시간표, 메모, Todo 정보도 모두 삭제됩니다.')) return;

        deleteSubjectBtn.disabled = true; // 삭제 버튼 비활성화
        try {
            // API 호출
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active'); // 모달 닫기

            // 로컬 데이터에서 삭제
            currentSubjects = currentSubjects.filter(s => s.id !== parseInt(subjectId, 10));

            // UI 다시 렌더링
            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
            renderSubjectDetailsList(currentSubjects);

            // 주차별 정보 패널 리셋 (삭제된 과목이 선택된 상태였다면)
            if (selectedSubjectForDetails && selectedSubjectForDetails.id === parseInt(subjectId, 10)) {
                resetWeeklyDetailsPanel();
            }

            await loadGpaStats(); // GPA 통계 다시 로드
        } catch (error) {
            alert(`삭제 실패: ${error.message}`);
        } finally {
            deleteSubjectBtn.disabled = false; // 삭제 버튼 활성화
        }
    }

    // --- Helper Functions --- (Request 3)
    // 학기 이름에서 시작일 추정 (백엔드 start_date 없을 경우 대비)
    function estimateSemesterStartDate(semesterName) {
        if (!semesterName) return null;

        // 학기 이름 파싱: "2024-2학기", "2024-1학기" 등
        const match = semesterName.match(/(\d{4})-?(\d|1|2|여름|겨울)?학기/);
        if (!match) return null;

        const year = parseInt(match[1], 10);
        const season = match[2];

        // 학기별 시작일 추정
        if (season === '1' || season === '첫' || season === '봄') {
            return new Date(year, 2, 2); // 3월 2일
        } else if (season === '2' || season === '가을') {
            return new Date(year, 8, 1); // 9월 1일
        } else if (season === '여름' || semesterName.includes('여름')) {
            return new Date(year, 5, 20); // 6월 20일
        } else if (season === '겨울' || semesterName.includes('겨울')) {
            return new Date(year, 11, 20); // 12월 20일
        }

        return null;
    }

    // 현재 날짜 기준 주차 계산 (Request 3)
    function calculateCurrentWeekNumber(startDate) {
        if (!startDate) return 1; // 시작일 없으면 1주차
        const today = new Date();
        const start = new Date(startDate); // Date 객체로 변환

        // 시간을 0으로 설정하여 날짜만 비교
        today.setHours(0, 0, 0, 0);
        start.setHours(0, 0, 0, 0);

        const diffTime = today - start;
        if (diffTime < 0) return 1; // 학기 시작 전이면 1주차

        // 날짜 차이 계산 (밀리초 -> 일)
        // getTimezoneOffset()을 더하여 UTC 기준으로 변환 후 차이 계산 (일광 절약 시간제 등 문제 방지)
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // 주차 계산 (0일부터 6일까지가 1주차)
        const weekNumber = Math.floor(diffDays / 7) + 1;

        return Math.max(1, Math.min(weekNumber, TOTAL_WEEKS)); // 1~16 범위 보장
    }


    initializePage(); // 페이지 초기화 함수 실행
});