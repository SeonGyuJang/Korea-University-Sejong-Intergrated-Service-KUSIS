document.addEventListener('DOMContentLoaded', () => {

    // --- 전역 변수 ---
    let currentSemesterId = null;
    let allSemesters = [];
    let currentSubjects = [];
    let gpaChartInstance = null;
    let selectedSubjectForDetails = null; // [NEW] 오른쪽 패널에서 선택된 과목
    let currentWeek = 1; // [NEW] 주차별 정보 표시용
    const TOTAL_WEEKS = 16; // [NEW] 총 주차 (임시)

    // [NEW] 과목별 색상 팔레트 및 맵
    const subjectColors = [
        'rgba(165, 0, 52, 0.1)', 'rgba(199, 0, 63, 0.1)', 'rgba(215, 69, 100, 0.1)',
        'rgba(140, 0, 40, 0.1)', 'rgba(180, 30, 70, 0.1)', 'rgba(230, 100, 130, 0.1)',
        'rgba(150, 10, 50, 0.1)', 'rgba(200, 50, 90, 0.1)'
    ];
    let subjectColorMap = {};

    // --- DOM 요소 캐싱 ---
    const semesterSelect = document.getElementById('semesterSelect');
    const timetableBody = document.getElementById('timetableEditorBody');
    const addSubjectBtn = document.getElementById('addSubjectBtn');

    // 왼쪽 사이드 위젯 DOM (기존 유지)
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

    // [NEW] 오른쪽 과목 상세 정보 사이드바 DOM
    const subjectDetailsListUl = document.getElementById('subjectDetailsList');
    const weeklyDetailsTitle = document.getElementById('weeklyDetailsTitle');
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


    // 탭 DOM (기존 유지)
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

    // --- 모달 DOM (기존 유지, 단 메모/Todo 관련 필드는 수정 모달에서 제거) ---
    // 새 과목 추가 모달
    const addSubjectModal = document.getElementById('addSubjectModal');
    const addSubjectForm = document.getElementById('addSubjectForm');
    const addSubjectSemesterIdInput = document.getElementById('addSubjectSemesterId');
    const addNameInput = document.getElementById('addSubjectName');
    const addProfInput = document.getElementById('addSubjectProfessor');
    const addCreditsInput = document.getElementById('addSubjectCredits');
    const addTimeSlotContainer = document.getElementById('addTimeSlotContainer');
    const addMoreTimeSlotBtn = document.getElementById('addMoreTimeSlotBtn');
    const saveNewSubjectBtn = document.getElementById('saveNewSubjectBtn');

    // 과목 수정 모달
    const editSubjectModal = document.getElementById('editSubjectModal');
    const editSubjectIdInput = document.getElementById('editSubjectId');
    const editNameInput = document.getElementById('editSubjectName');
    const editProfInput = document.getElementById('editSubjectProfessor');
    const editCreditsInput = document.getElementById('editSubjectCredits');
    const editGradeInput = document.getElementById('editSubjectGrade'); // 등급 필드는 유지
    const editTimeSlotContainer = document.getElementById('editTimeSlotContainer');
    const editAddTimeSlotBtn = document.getElementById('editAddTimeSlotBtn');
    // [REMOVED] 메모/Todo 관련 DOM 요소 제거
    // const editMemoTextInput = document.getElementById('editMemoText');
    // const editTodoListUl = document.getElementById('editMemoTodoList');
    // const editTodoNewInput = document.getElementById('editMemoNewTodoInput');
    // const editTodoAddBtn = document.getElementById('editMemoAddTodoBtn');
    const updateSubjectBtn = document.getElementById('updateSubjectBtn');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');

    // --- 1. 초기화 ---
    async function initializePage() {
        setupEventListeners();

        // 서버에서 학기 목록 로드
        await loadAllSemesters();

        // 학기 목록이 있으면, 첫 학기 시간표 로드
        if (allSemesters.length > 0) {
            currentSemesterId = allSemesters[0].id;
            semesterSelect.value = currentSemesterId;
            await loadTimetableForSemester(currentSemesterId);
        } else {
            // 학기가 없는 경우 UI 처리
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">등록된 학기가 없습니다.</td></tr>`;
            if(subjectDetailsListUl) subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">등록된 학기가 없습니다.</li>';
            addSubjectBtn.disabled = true;
        }

        // GPA 그래프 및 학점 정보 로드
        loadGpaStats();
        updateWeekView(); // [NEW] 초기 주차 표시
    }

    // --- 2. 이벤트 리스너 설정 ---
    function setupEventListeners() {
        semesterSelect.addEventListener('change', handleSemesterChange);
        addSubjectBtn.addEventListener('click', openAddSubjectModal);

        // 목표 학점 관련 (기존 유지)
        editGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'flex'; editGoalBtn.style.display = 'none'; });
        cancelGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'none'; editGoalBtn.style.display = 'inline-block'; });
        saveGoalBtn.addEventListener('click', saveCreditGoal);
        refreshGpaChartBtn.addEventListener('click', loadGpaStats);

        // '새 과목 추가' 모달 (기존 유지)
        addMoreTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, addTimeSlotContainer));
        saveNewSubjectBtn.addEventListener('click', saveNewSubject);
        addSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => addSubjectModal.classList.remove('active')));

        // '과목 수정' 모달 (메모/Todo 관련 리스너 제거)
        editAddTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, editTimeSlotContainer));
        // [REMOVED] editTodoAddBtn 리스너 제거
        // [REMOVED] editTodoNewInput 리스너 제거
        updateSubjectBtn.addEventListener('click', updateSubject); // updateSubject 함수 내부 수정 필요
        deleteSubjectBtn.addEventListener('click', deleteSubject);
        editSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => editSubjectModal.classList.remove('active')));

        // [NEW] 오른쪽 사이드바 이벤트 리스너
        prevWeekBtn.addEventListener('click', () => changeWeek(-1));
        nextWeekBtn.addEventListener('click', () => changeWeek(1));
        weeklyAddTodoBtn.addEventListener('click', addWeeklyTodoItem);
        weeklyNewTodoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addWeeklyTodoItem();
            }
        });
        saveWeeklyMemoTodoBtn.addEventListener('click', saveWeeklyMemoTodo); // 저장 함수 구현 필요 (백엔드 연동)

    }

    // --- 3. 데이터 로딩 (API) ---
    async function loadAllSemesters() {
        try {
            const response = await fetch('/api/semesters');
            if (!response.ok) throw new Error('학기 목록 로드 실패');
            allSemesters = await response.json();
            populateSemesterDropdown();
        } catch (error) {
            console.error(error);
            semesterSelect.innerHTML = `<option value="">${error.message}</option>`;
        }
    }

    async function handleSemesterChange() {
        const selectedId = parseInt(semesterSelect.value, 10);
        if (selectedId && selectedId !== currentSemesterId) {
            currentSemesterId = selectedId;
            await loadTimetableForSemester(currentSemesterId);
            selectedSubjectForDetails = null; // 학기 변경 시 선택된 과목 초기화
            resetWeeklyDetailsPanel(); // 주차별 정보 패널 초기화
        }
    }

    async function loadTimetableForSemester(semesterId) {
        if (!semesterId) {
            clearTimetableAndTodos();
            resetSubjectDetailsPanel(); // [NEW] 과목 목록 패널 초기화
            resetWeeklyDetailsPanel(); // [NEW] 주차별 정보 패널 초기화
            return;
        }
        timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">시간표 로딩 중...</td></tr>`;
        subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">과목 목록 로딩 중...</li>'; // [NEW]
        try {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error(`시간표 로드 실패 (${response.status})`);
            const data = await response.json();
            currentSubjects = data.subjects || [];
            // Parse memo string to object if needed (for backward compatibility)
            currentSubjects.forEach(s => {
                if (typeof s.memo === 'string') {
                    try { s.memo = JSON.parse(s.memo); } catch(e) { s.memo = {note: '', todos: []}; }
                }
                if (!s.memo || typeof s.memo !== 'object') s.memo = {note: '', todos: []};
                if (!Array.isArray(s.memo.todos)) s.memo.todos = [];
                 if (typeof s.memo.note !== 'string') s.memo.note = '';
            });

            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects); // 왼쪽 패널 Todo 요약
            renderSubjectDetailsList(currentSubjects); // [NEW] 오른쪽 패널 과목 목록
            resetWeeklyDetailsPanel(); // [NEW] 새 학기 로드 시 주차별 정보 초기화
        } catch (error) {
            console.error(error);
            clearTimetableAndTodos();
            resetSubjectDetailsPanel(error.message); // [NEW] 에러 메시지 표시
            resetWeeklyDetailsPanel();
        }
    }

    async function loadGpaStats() {
        if (!gpaChartCanvas) return;
        try {
            const response = await fetch('/api/gpa-stats');
            if (!response.ok) throw new Error(`GPA 통계 로드 실패 (${response.status})`);
            const statsData = await response.json();

            updateCreditProgress(statsData.total_earned_credits, parseInt(goalCreditsEl.textContent, 10));
            overallGpaEl.textContent = statsData.overall_gpa;

            renderGpaChart(statsData.semesters);
        } catch (error) {
            console.error(error);
            const ctx = gpaChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, gpaChartCanvas.width, gpaChartCanvas.height);
            ctx.textAlign = 'center'; // 텍스트 중앙 정렬
            ctx.fillText(error.message, gpaChartCanvas.width / 2, gpaChartCanvas.height / 2);
        }
    }

    // --- 4. 렌더링 함수 ---
    function populateSemesterDropdown() {
        semesterSelect.innerHTML = '';
        if (allSemesters.length > 0) {
            allSemesters.forEach(s => {
                const option = new Option(s.name, s.id);
                semesterSelect.add(option);
            });
            addSubjectBtn.disabled = false;
        } else {
            semesterSelect.innerHTML = '<option value="">학기 없음</option>';
            addSubjectBtn.disabled = true;
        }
    }

    /**
     * [MODIFIED] 시간표 그리드를 동적으로 렌더링하는 함수 (Req #2, #4)
     * - 시간 범위를 과목 시간에 맞춰 동적으로 조절 (maxHour + 1 추가)
     * - 과목별 색상 적용
     */
    function renderTimetableGrid(subjects) {
        timetableBody.innerHTML = '';
        subjectColorMap = {}; // 색상 맵 초기화

        // 1. 과목 데이터로 시간 범위 계산 (Req #2)
        let minHour = 9;  // 기본 시작 시간
        let maxHour = 18; // 기본 종료 시간 (포함)

        if (subjects && subjects.length > 0) {
            let earliestStartHour = 24;
            let latestEndHour = 0; // 끝나는 시간의 '시' (예: 14:45 -> 14)

            subjects.forEach((subject, index) => {
                 // 과목별 색상 할당 (Req #4)
                if (!subjectColorMap[subject.id]) {
                    subjectColorMap[subject.id] = subjectColors[index % subjectColors.length];
                }

                subject.timeslots.forEach(ts => {
                    const startH = parseInt(ts.start.split(':')[0]);
                    const endH = parseInt(ts.end.split(':')[0]);
                    const endM = parseInt(ts.end.split(':')[1]);

                    earliestStartHour = Math.min(earliestStartHour, startH);
                    // 끝나는 시간이 14:01이면 latestEndHour는 14
                    // 끝나는 시간이 14:00이면 latestEndHour는 13 (14시는 포함 안해도 됨)
                    latestEndHour = Math.max(latestEndHour, (endM > 0 ? endH : endH - 1));
                });
            });

            if (earliestStartHour < 24) minHour = Math.min(minHour, earliestStartHour);
            // maxHour는 마지막 교시가 끝나는 시간 + 1시간까지 보여주기 위함 (Req #2)
            // 예를 들어 14:45 종료 시 latestEndHour는 14, maxHour는 15가 되어 15:00까지 표시됨.
             if (latestEndHour >= 0) maxHour = Math.max(maxHour, latestEndHour + 1);
        } else {
            minHour = 9;
            maxHour = 18;
        }

        // 2. 시간표 그리드(행) 생성
        for (let h = minHour; h <= maxHour; h++) {
            const hourStr = String(h).padStart(2, '0');
            const row = document.createElement('tr');
            row.setAttribute('data-hour', hourStr); // JS가 시간대를 찾기 위한 속성
            row.innerHTML = `
                <td>${hourStr}:00</td>
                <td data-day="1"></td>
                <td data-day="2"></td>
                <td data-day="3"></td>
                <td data-day="4"></td>
                <td data-day="5"></td>
            `;
            timetableBody.appendChild(row);
        }

        // 3. 과목 슬롯 배치 (DOM 렌더링 후)
        requestAnimationFrame(() => {
            const firstRowCell = timetableBody.querySelector('td[data-day="1"]');
            if (!firstRowCell) {
                 console.warn("Timetable grid not ready.");
                  if (subjects.length === 0) {
                      timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">이번 학기에 등록된 과목이 없습니다.</td></tr>`;
                  }
                 return;
            }

            const cellHeight = firstRowCell.offsetHeight;
            if (!cellHeight || cellHeight === 0) {
                console.warn("Cell height is 0, cannot position slots. Retrying...");
                setTimeout(() => renderTimetableGrid(subjects), 100); // 재시도
                return;
            }

            subjects.forEach(subject => {
                const subjectColor = subjectColorMap[subject.id] || 'rgba(165, 0, 52, 0.1)'; // 기본 색상

                subject.timeslots.forEach(ts => {
                    const startHour = parseInt(ts.start.split(':')[0]);
                    const startMinute = parseInt(ts.start.split(':')[1]);
                    const endHour = parseInt(ts.end.split(':')[0]);
                    const endMinute = parseInt(ts.end.split(':')[1]);

                    // 이 과목이 표시될 시간대의 셀(e.g., 10:00)을 찾음
                    const targetHourStr = String(startHour).padStart(2, '0');
                    const targetCell = timetableBody.querySelector(`tr[data-hour="${targetHourStr}"] td[data-day="${ts.day}"]`);

                    if (!targetCell) {
                         // 표시 범위 밖이면 건너뜀
                         console.warn(`Cell not found for day ${ts.day}, hour ${targetHourStr} (Out of display range?)`);
                         return;
                    }

                    // 셀 높이(1시간=50px) 기준으로 offset과 height 계산
                    const minutesPerHour = 60;
                    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

                    const topOffset = (startMinute / minutesPerHour) * cellHeight;
                    // 높이 계산 시 border 고려하여 1~2px 빼기, 최소 높이 보장
                    const slotHeight = Math.max(10, (durationMinutes / minutesPerHour) * cellHeight - 2);


                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'subject-slot';
                    slotDiv.style.top = `${topOffset}px`;
                    slotDiv.style.height = `${slotHeight}px`;
                    slotDiv.style.backgroundColor = subjectColor; // 색상 적용 (Req #4)
                    slotDiv.style.borderLeft = `3px solid ${subjectColor.replace('0.1', '0.5')}`; // 테두리 색상

                    // 슬롯 내용 (높이가 작으면 강의실 숨김)
                    let innerHTML = `<div class="slot-subject">${subject.name}</div>`;
                    if (slotHeight > 25) { // 높이가 충분할 때만 강의실 정보 표시
                        innerHTML += `<div class="slot-room">${ts.room || ''}</div>`;
                    }
                    slotDiv.innerHTML = innerHTML;

                    slotDiv.addEventListener('click', () => openEditSubjectModal(subject.id));
                    targetCell.appendChild(slotDiv);
                });
            });
        });
    }

    function clearTimetableAndTodos() {
        timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">표시할 시간표가 없습니다.</td></tr>`;
        todoSummaryList.innerHTML = '<p class="todo-summary-empty">학기를 선택해주세요.</p>';
    }

    // 왼쪽 패널 Todo 요약 (기존 유지)
    function renderTodoSummary(subjects) {
        todoSummaryList.innerHTML = '';
        const subjectsWithTodos = subjects.filter(s => s.memo && s.memo.todos && s.memo.todos.length > 0);
        if (subjectsWithTodos.length === 0) {
            todoSummaryList.innerHTML = '<p class="todo-summary-empty">이번 학기 Todo가 없습니다.</p>';
            return;
        }
        subjectsWithTodos.forEach(subject => {
            const pendingTodos = subject.memo.todos.filter(t => !t.done);
            const isCompleted = pendingTodos.length === 0;
            const itemDiv = document.createElement('div');
            itemDiv.className = `todo-summary-item ${isCompleted ? 'completed' : ''}`;
            itemDiv.innerHTML = `
                <div class="todo-subject">${subject.name} (${isCompleted ? '완료' : `${pendingTodos.length}개 남음`})</div>
                <ul class="todo-list">
                    ${subject.memo.todos.map(todo => `<li class="todo-list-item ${todo.done ? 'done' : 'pending'}"><i class="fas ${todo.done ? 'fa-check-square' : 'fa-square'}"></i> ${todo.task}</li>`).join('')}
                </ul>`;
            todoSummaryList.appendChild(itemDiv);
        });
    }

    // GPA 차트 (기존 유지)
    function renderGpaChart(semesters) {
        if (!gpaChartCanvas) return;
        if (gpaChartInstance) gpaChartInstance.destroy();
        gpaChartInstance = new Chart(gpaChartCanvas, {
            type: 'line',
            data: {
                labels: semesters.map(s => s.semester_name.replace('년 ', '.')),
                datasets: [{
                    label: '학기별 평점(GPA)',
                    data: semesters.map(s => s.gpa),
                    backgroundColor: 'rgba(165, 0, 52, 0.1)',
                    borderColor: 'rgba(165, 0, 52, 1)',
                    borderWidth: 2,
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 4.5 } },
                plugins: { tooltip: { mode: 'index', intersect: false } }
            }
        });
    }

    // [NEW] 오른쪽 과목 상세 목록 렌더링 (Req #3)
    function renderSubjectDetailsList(subjects) {
        subjectDetailsListUl.innerHTML = '';
        if (!subjects || subjects.length === 0) {
            subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">이 학기에 등록된 과목이 없습니다.</li>';
            return;
        }
        subjects.forEach(subject => {
            const li = document.createElement('li');
            li.className = 'subject-details-item';
            // 선택 시 하이라이트를 위해 data-subject-id 추가
            li.setAttribute('data-subject-id', subject.id);
            li.innerHTML = `
                <div class="subject-info">
                    <span class="subject-name">${subject.name}</span>
                    <span class="subject-prof">${subject.professor || ''} (${subject.credits}학점)</span>
                </div>
                <div class="subject-grade">
                    <select class="grade-select" data-subject-id="${subject.id}">
                        <option value="Not Set" ${subject.grade === 'Not Set' ? 'selected' : ''}>미설정</option>
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
            // 과목 리스트 항목 클릭 시 주차별 정보 로드
            li.addEventListener('click', () => {
                 // 이전에 선택된 항목 하이라이트 제거
                 subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
                 // 현재 항목 하이라이트 추가
                 li.classList.add('selected');
                 selectSubjectForDetails(subject.id);
            });
             // 등급 변경 이벤트 리스너 추가
             li.querySelector('.grade-select').addEventListener('change', handleGradeChange);

            subjectDetailsListUl.appendChild(li);
        });
    }

     // [NEW] 과목 선택 시 주차별 정보 로드 함수
     function selectSubjectForDetails(subjectId) {
         selectedSubjectForDetails = currentSubjects.find(s => s.id === subjectId);
         if (selectedSubjectForDetails) {
             weeklyDetailsTitle.innerHTML = `<i class="fas fa-calendar-week"></i> 주차별 정보 (${selectedSubjectForDetails.name})`;
             currentWeek = 1; // 과목 선택 시 첫 주로 초기화
             updateWeekView(); // 주차 표시 업데이트 및 해당 주차 메모/Todo 로드
             enableWeeklyDetailsPanel(); // 패널 활성화
         } else {
             resetWeeklyDetailsPanel(); // 과목 못 찾으면 초기화
         }
     }

     // [NEW] 등급 변경 처리 함수
     async function handleGradeChange(event) {
         const selectElement = event.target;
         const subjectId = parseInt(selectElement.dataset.subjectId, 10);
         const newGrade = selectElement.value;
         const subject = currentSubjects.find(s => s.id === subjectId);

         if (!subject) return;

         // 낙관적 업데이트: UI 즉시 변경
         subject.grade = newGrade;
         selectElement.value = newGrade; // Ensure UI consistency

         // 서버에 변경 사항 저장 (기존 updateSubject API 활용)
         try {
             // timeslots 데이터를 올바르게 포함하여 전송
             const timeslotsData = subject.timeslots.map(ts => ({
                day: ts.day,
                start: ts.start,
                end: ts.end,
                room: ts.room
             }));

             const response = await fetch(`/api/subjects/${subjectId}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                    // 다른 필드도 함께 보내야 할 수 있음 (API 구현에 따라)
                    name: subject.name,
                    professor: subject.professor,
                    credits: subject.credits,
                    grade: newGrade, // 변경된 등급
                    timeslots: timeslotsData, // 시간표 정보 포함
                    memo: subject.memo // 메모 정보도 포함
                 })
             });
             const result = await response.json();
             if (result.status !== 'success') {
                 throw new Error(result.message);
             }
             console.log(`Subject ${subjectId} grade updated to ${newGrade}`);
             // 성공 시 GPA 정보 새로고침
             loadGpaStats();
         } catch (error) {
             // 업데이트 실패 시 롤백 (이전 값으로 되돌리기 - 필요시 구현)
             alert(`등급 업데이트 실패: ${error.message}`);
             // 예: selectElement.value = subject.grade; // 이전 값으로 복원
         }
     }

     // [NEW] 주차 변경 함수
     function changeWeek(delta) {
         const newWeek = currentWeek + delta;
         if (newWeek >= 1 && newWeek <= TOTAL_WEEKS) {
             currentWeek = newWeek;
             updateWeekView();
         }
     }

     // [NEW] 주차 표시 업데이트 및 해당 주차 메모/Todo 로드 함수
     function updateWeekView() {
         currentWeekDisplay.textContent = `${currentWeek}주차`;
         prevWeekBtn.disabled = (currentWeek === 1);
         nextWeekBtn.disabled = (currentWeek === TOTAL_WEEKS);

         // 선택된 과목이 있을 때만 메모/Todo 로드 시도
         if (selectedSubjectForDetails) {
             loadWeeklyMemoTodo();
         } else {
             resetWeeklyDetailsPanel();
         }
     }

     // [NEW] 주차별 메모/Todo 로드 (Placeholder - 백엔드 필요)
     function loadWeeklyMemoTodo() {
         if (!selectedSubjectForDetails) return;

         // 백엔드 구현 전: 임시로 과목의 기본 memo/todo를 보여줌
         const memoData = selectedSubjectForDetails.memo || { note: '', todos: [] };
         weeklyMemoText.value = memoData.note; // 현재는 과목 전체 메모 표시
         renderWeeklyTodoList(memoData.todos); // 현재는 과목 전체 Todo 표시

         // TODO: 백엔드 구현 후 - 아래 로직으로 대체
         /*
         try {
             // const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`);
             // if (!response.ok) throw new Error('Failed to load weekly data');
             // const weeklyData = await response.json(); // { note: "...", todos: [...] }
             // weeklyMemoText.value = weeklyData.note || '';
             // renderWeeklyTodoList(weeklyData.todos || []);

             weeklyMemoSubjectName.textContent = selectedSubjectForDetails.name;
             weeklyTodoSubjectName.textContent = selectedSubjectForDetails.name;
             enableWeeklyDetailsPanel();
         } catch (error) {
             console.error(`Error loading week ${currentWeek} data:`, error);
             weeklyMemoText.value = '주차 정보 로드 실패';
             weeklyTodoListUl.innerHTML = '<li class="todo-empty">주차 정보 로드 실패</li>';
             // disableWeeklyDetailsPanel(); // 로드 실패 시 비활성화
         }
         */
     }

     // [NEW] 주차별 Todo 목록 렌더링 함수 (renderTodoList와 유사)
     function renderWeeklyTodoList(todos) {
         weeklyTodoListUl.innerHTML = '';
         if (!todos || todos.length === 0) {
             weeklyTodoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
             return;
         }

         // 임시: 현재 선택된 과목의 memo 객체에 todos 저장 (백엔드 연동 전)
         if (selectedSubjectForDetails && !selectedSubjectForDetails.memo) {
             selectedSubjectForDetails.memo = { note: '', todos: [] };
         }
         if(selectedSubjectForDetails) selectedSubjectForDetails.memo.todos = todos; // 주차별 저장이 안되므로 일단 덮어쓰기

         todos.forEach((todo, index) => {
             const li = document.createElement('li');
             li.className = todo.done ? 'todo-item done' : 'todo-item';
             const todoId = `weekly-todo-${currentWeek}-${index}-${Date.now()}`;
             li.innerHTML = `
                 <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
                 <label for="${todoId}" class="todo-label">${todo.task}</label>
                 <span class="todo-delete-btn" data-index="${index}">&times;</span>
             `;
             li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                 // 임시: 현재 과목 memo 객체 직접 수정 (백엔드 연동 전)
                 if (selectedSubjectForDetails && selectedSubjectForDetails.memo && selectedSubjectForDetails.memo.todos[index]) {
                     selectedSubjectForDetails.memo.todos[index].done = e.target.checked;
                     li.classList.toggle('done', e.target.checked);
                 }
             });
             li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
                  // 임시: 현재 과목 memo 객체 직접 수정 (백엔드 연동 전)
                 if (selectedSubjectForDetails && selectedSubjectForDetails.memo && selectedSubjectForDetails.memo.todos) {
                     const indexToRemove = parseInt(e.target.dataset.index, 10);
                     selectedSubjectForDetails.memo.todos.splice(indexToRemove, 1);
                     renderWeeklyTodoList(selectedSubjectForDetails.memo.todos); // 목록 다시 렌더링
                 }
             });
             weeklyTodoListUl.appendChild(li);
         });
     }

     // [NEW] 주차별 Todo 추가 함수
     function addWeeklyTodoItem() {
         const taskText = weeklyNewTodoInput.value.trim();
         if (taskText === '' || !selectedSubjectForDetails) return;

         const newTodo = { task: taskText, done: false };

         const emptyMsg = weeklyTodoListUl.querySelector('.todo-empty');
         if (emptyMsg) weeklyTodoListUl.innerHTML = '';

          // 임시: 현재 과목 memo 객체 직접 수정 (백엔드 연동 전)
          if (!selectedSubjectForDetails.memo) selectedSubjectForDetails.memo = { note: '', todos: []};
          if (!selectedSubjectForDetails.memo.todos) selectedSubjectForDetails.memo.todos = [];

         selectedSubjectForDetails.memo.todos.push(newTodo);
         renderWeeklyTodoList(selectedSubjectForDetails.memo.todos); // 업데이트된 목록으로 다시 렌더링

         weeklyNewTodoInput.value = '';
         weeklyNewTodoInput.focus();
     }


     // [NEW] 주차별 메모/Todo 저장 함수 (Placeholder - 백엔드 필요)
     async function saveWeeklyMemoTodo() {
         if (!selectedSubjectForDetails) {
             alert("과목을 먼저 선택해주세요.");
             return;
         }
         const note = weeklyMemoText.value.trim();
          // 임시: 현재 과목 memo 객체에서 todos 가져오기
         const todos = selectedSubjectForDetails.memo ? selectedSubjectForDetails.memo.todos : [];

         // TODO: 백엔드 구현 후 - 아래 로직으로 대체
         console.log(`(Placeholder) Saving Week ${currentWeek} for Subject ${selectedSubjectForDetails.id}`);
         console.log("Note:", note);
         console.log("Todos:", todos);
         alert(`백엔드 미구현: ${currentWeek}주차 메모/Todo 저장 로직 필요`);

         saveWeeklyMemoTodoBtn.disabled = true;
         saveWeeklyMemoTodoBtn.textContent = '저장 중...';

         try {
             // const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`, {
             //     method: 'PUT', // 또는 POST
             //     headers: { 'Content-Type': 'application/json' },
             //     body: JSON.stringify({ note: note, todos: todos })
             // });
             // if (!response.ok) throw new Error('Failed to save weekly data');
             // const result = await response.json();
             // alert("주차별 정보가 저장되었습니다."); // 성공 메시지

             // 임시: 저장이 완료된 것처럼 보이게 함
              await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 딜레이
              alert(`(임시) ${currentWeek}주차 정보 저장 완료 (실제 저장되지 않음)`);

         } catch (error) {
             console.error("Failed to save weekly memo/todo:", error);
             alert(`주차별 정보 저장 실패: ${error.message}`);
         } finally {
             saveWeeklyMemoTodoBtn.disabled = false;
             saveWeeklyMemoTodoBtn.textContent = '주차 정보 저장';
         }
     }


     // [NEW] 오른쪽 패널 초기화 함수
     function resetSubjectDetailsPanel(message = "학기를 선택해주세요.") {
          if(subjectDetailsListUl) subjectDetailsListUl.innerHTML = `<li class="subject-details-empty">${message}</li>`;
     }
     function resetWeeklyDetailsPanel() {
         weeklyDetailsTitle.innerHTML = '<i class="fas fa-calendar-week"></i> 주차별 정보';
         weeklyMemoSubjectName.textContent = "과목 선택";
         weeklyTodoSubjectName.textContent = "과목 선택";
         weeklyMemoText.value = '';
         weeklyTodoListUl.innerHTML = '<li class="todo-empty">과목을 선택해주세요.</li>';
         weeklyNewTodoInput.value = '';
         currentWeek = 1;
         updateWeekView(); // 주차 표시 초기화
         disableWeeklyDetailsPanel();
         selectedSubjectForDetails = null;
         // 선택된 과목 하이라이트 제거
         if(subjectDetailsListUl) subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
     }
     function enableWeeklyDetailsPanel() {
         weeklyMemoText.disabled = false;
         weeklyNewTodoInput.disabled = false;
         weeklyAddTodoBtn.disabled = false;
         saveWeeklyMemoTodoBtn.disabled = false;
     }
     function disableWeeklyDetailsPanel() {
         weeklyMemoText.disabled = true;
         weeklyNewTodoInput.disabled = true;
         weeklyAddTodoBtn.disabled = true;
         saveWeeklyMemoTodoBtn.disabled = true;
     }


    // --- 5. 학점 위젯 로직 (기존 유지) ---
    function updateCreditProgress(current, goal) {
         const remaining = Math.max(0, goal - current);
         const percentage = (goal > 0) ? Math.min(100, (current / goal) * 100) : 0;
         const circumference = 2 * Math.PI * 45; // r=45
         const dashoffset = circumference - (circumference * percentage / 100);
         currentCreditsEl.textContent = current;
         goalCreditsEl.textContent = goal;
         remainingCreditsEl.textContent = remaining;
         creditPercentageEl.textContent = `${Math.round(percentage)}%`;
         if (creditProgressCircle) creditProgressCircle.style.strokeDashoffset = dashoffset;
    }

    async function saveCreditGoal() {
        const newGoal = parseInt(newGoalInput.value, 10);
        if (isNaN(newGoal) || newGoal <= 0) { alert('유효한 학점을 입력하세요.'); return; }
        saveGoalBtn.disabled = true;
        try {
            const response = await fetch('/api/credits/goal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: newGoal }) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            updateCreditProgress(parseInt(currentCreditsEl.textContent, 10), result.new_goal);
            editGoalForm.style.display = 'none';
            editGoalBtn.style.display = 'inline-block';
        } catch (error) {
            alert(`목표 학점 저장 실패: ${error.message}`);
        } finally {
            saveGoalBtn.disabled = false;
        }
    }

    // --- 6. 모달 로직 (추가/수정 분리, 수정 모달에서 메모/Todo 제거) ---
    function openAddSubjectModal() {
        if (!currentSemesterId) { alert("과목을 추가할 학기를 선택해주세요."); return; }
        addSubjectForm.reset();
        addSubjectSemesterIdInput.value = currentSemesterId;
        addTimeSlotContainer.innerHTML = '';
        createTimeSlotEntry(null, addTimeSlotContainer); // 기본 시간 슬롯 1개 추가
        addSubjectModal.classList.add('active');
    }

    function openEditSubjectModal(subjectId) {
        const subject = currentSubjects.find(s => s.id === subjectId);
        if (!subject) return;
        editSubjectIdInput.value = subject.id;
        editNameInput.value = subject.name;
        editProfInput.value = subject.professor;
        editCreditsInput.value = subject.credits;
        editGradeInput.value = subject.grade || "Not Set"; // 등급은 수정 모달에 유지
        editTimeSlotContainer.innerHTML = '';
        if (subject.timeslots.length > 0) {
            subject.timeslots.forEach(ts => createTimeSlotEntry(ts, editTimeSlotContainer));
        } else {
            createTimeSlotEntry(null, editTimeSlotContainer);
        }
        // [REMOVED] 메모/Todo 관련 필드 채우는 로직 제거
        // const memo = subject.memo || { note: '', todos: [] };
        // editMemoTextInput.value = memo.note || '';
        // renderTodoListInModal(memo.todos || [], editTodoListUl);
        editSubjectModal.classList.add('active');
    }

    // 시간 슬롯 생성 (기존 유지)
    function createTimeSlotEntry(timeslot, container) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeslot-entry';
        entryDiv.innerHTML = `
            <select name="day">
                <option value="1">월</option><option value="2">화</option><option value="3">수</option>
                <option value="4">목</option><option value="5">금</option>
            </select>
            <input type="time" name="start_time" value="${timeslot ? timeslot.start : '09:00'}">
            <input type="time" name="end_time" value="${timeslot ? timeslot.end : '10:15'}">
            <input type="text" name="room" placeholder="강의실" value="${timeslot ? (timeslot.room || '') : ''}">
            <button type="button" class="timeslot-delete-btn">&times;</button>
        `;
        if (timeslot) entryDiv.querySelector('select[name="day"]').value = timeslot.day;
        entryDiv.querySelector('.timeslot-delete-btn').addEventListener('click', () => entryDiv.remove());
        container.appendChild(entryDiv);
    }

    // [REMOVED] renderTodoListInModal 함수 제거
    // [REMOVED] addTodoItemToModal 함수 제거
    // [REMOVED] getTodosFromModal 함수 제거

    // --- 7. 데이터 저장/수정/삭제 API 호출 ---
    // 새 과목 저장 (기존 유지)
    async function saveNewSubject() {
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
            })).filter(ts => ts.day && ts.start && ts.end)
            // memo는 서버에서 기본값으로 생성될 것이므로 여기서 보낼 필요 없음
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }

        saveNewSubjectBtn.disabled = true;
        try {
            const response = await fetch('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            addSubjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId); // 목록 새로고침
            await loadGpaStats(); // 학점 정보도 갱신될 수 있으므로 호출
        } catch (error) {
            alert(`저장 실패: ${error.message}`);
        } finally {
            saveNewSubjectBtn.disabled = false;
        }
    }

    // 과목 수정 (메모/Todo 관련 로직 제거)
    async function updateSubject() {
        const subjectId = editSubjectIdInput.value;
        const subject = currentSubjects.find(s => s.id === parseInt(subjectId, 10));
        if (!subject) return;

        const data = {
            name: editNameInput.value.trim(),
            professor: editProfInput.value.trim(),
            credits: parseInt(editCreditsInput.value, 10) || 0,
            grade: editGradeInput.value, // 등급은 수정 모달에서 관리
            timeslots: Array.from(editTimeSlotContainer.querySelectorAll('.timeslot-entry')).map(entry => ({
                day: parseInt(entry.querySelector('[name="day"]').value, 10),
                start: entry.querySelector('[name="start_time"]').value,
                end: entry.querySelector('[name="end_time"]').value,
                room: entry.querySelector('[name="room"]').value.trim()
            })).filter(ts => ts.day && ts.start && ts.end),
             // [MODIFIED] 기존 메모 데이터 유지하며 전송
             memo: subject.memo || { note: '', todos: [] }
            // memo: {
            //     note: editMemoTextInput.value.trim(), // 이 필드 제거됨
            //     todos: getTodosFromModal(editTodoListUl) // 이 필드 제거됨
            // }
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }

        updateSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId); // 목록 새로고침
            await loadGpaStats(); // GPA 정보 새로고침
        } catch (error) {
            alert(`수정 실패: ${error.message}`);
        } finally {
            updateSubjectBtn.disabled = false;
        }
    }

    // 과목 삭제 (기존 유지)
    async function deleteSubject() {
        const subjectId = editSubjectIdInput.value;
        if (!subjectId || !confirm('정말로 이 과목을 삭제하시겠습니까? 관련된 시간표 정보도 모두 삭제됩니다.')) return;

        deleteSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId); // 목록 새로고침
            await loadGpaStats(); // GPA 정보 새로고침
        } catch (error) {
            alert(`삭제 실패: ${error.message}`);
        } finally {
            deleteSubjectBtn.disabled = false;
        }
    }

    initializePage();
});