document.addEventListener('DOMContentLoaded', () => {

    // --- 전역 변수 ---
    let currentSemesterId = null;
    let allSemesters = [];
    let currentSubjects = [];
    let gpaChartInstance = null;
    let selectedSubjectForDetails = null;
    
    let currentWeek = 1; 
    const TOTAL_WEEKS = 16;
    let currentWeeklyData = { note: "", todos: [] };

    // [FIX #4] 과목별 색상 팔레트 (더 선명한 색상)
    const subjectColors = [
        'rgba(244, 67, 54, 0.2)',    // Red
        'rgba(233, 30, 99, 0.2)',    // Pink
        'rgba(156, 39, 176, 0.2)',   // Purple
        'rgba(103, 58, 183, 0.2)',   // Deep Purple
        'rgba(63, 81, 181, 0.2)',    // Indigo
        'rgba(33, 150, 243, 0.2)',   // Blue
        'rgba(3, 169, 244, 0.2)',    // Light Blue
        'rgba(0, 188, 212, 0.2)',    // Cyan
        'rgba(0, 150, 136, 0.2)',    // Teal
        'rgba(76, 175, 80, 0.2)',    // Green
        'rgba(255, 152, 0, 0.2)',    // Orange
        'rgba(121, 85, 72, 0.2)'     // Brown
    ];
    let subjectColorMap = {};

    // --- DOM 요소 캐싱 ---
    const semesterSelect = document.getElementById('semesterSelect');
    const timetableBody = document.getElementById('timetableEditorBody');
    const addSubjectBtnContainer = document.getElementById('addSubjectBtnContainer');
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
    async function initializePage() {
        setupEventListeners();
        await loadAllSemesters();

        // [FIX #2] 현재 학기 자동 선택
        if (allSemesters.length > 0) {
            // 첫 번째 학기(최신 학기)를 선택
            currentSemesterId = allSemesters[0].id;
            semesterSelect.value = currentSemesterId;
            await loadTimetableForSemester(currentSemesterId);
        } else {
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">등록된 학기가 없습니다.</td></tr>`;
            if(subjectDetailsListUl) subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">등록된 학기가 없습니다.</li>';
            addSubjectBtn.disabled = true;
        }

        loadGpaStats();
        updateWeekView();
    }

    // --- 2. 이벤트 리스너 설정 ---
    function setupEventListeners() {
        semesterSelect.addEventListener('change', handleSemesterChange);
        addSubjectBtn.addEventListener('click', openAddSubjectModal);

        editGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'flex'; editGoalBtn.style.display = 'none'; });
        cancelGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'none'; editGoalBtn.style.display = 'inline-block'; });
        saveGoalBtn.addEventListener('click', saveCreditGoal);
        refreshGpaChartBtn.addEventListener('click', loadGpaStats);

        addMoreTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, addTimeSlotContainer));
        saveNewSubjectBtn.addEventListener('click', saveNewSubject);
        addSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => addSubjectModal.classList.remove('active')));

        editAddTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, editTimeSlotContainer));
        updateSubjectBtn.addEventListener('click', updateSubject);
        deleteSubjectBtn.addEventListener('click', deleteSubject);
        editSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => editSubjectModal.classList.remove('active')));

        prevWeekBtn.addEventListener('click', () => changeWeek(-1));
        nextWeekBtn.addEventListener('click', () => changeWeek(1));
        weeklyAddTodoBtn.addEventListener('click', addWeeklyTodoItem);
        weeklyNewTodoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addWeeklyTodoItem();
            }
        });
        saveWeeklyMemoTodoBtn.addEventListener('click', saveWeeklyMemoTodo);
        
        viewAllWeeksBtn.addEventListener('click', openAllWeeksModal);
        allWeeksModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => allWeeksModal.classList.remove('active')));
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
            selectedSubjectForDetails = null;
            resetWeeklyDetailsPanel();
        }
    }

    async function loadTimetableForSemester(semesterId) {
        if (!semesterId) {
            clearTimetableAndTodos();
            resetSubjectDetailsPanel();
            resetWeeklyDetailsPanel();
            return;
        }
        timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">시간표 로딩 중...</td></tr>`;
        subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">과목 목록 로딩 중...</li>';
        try {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error(`시간표 로드 실패 (${response.status})`);
            const data = await response.json();
            currentSubjects = data.subjects || [];
            
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
            resetWeeklyDetailsPanel();
        } catch (error) {
            console.error(error);
            clearTimetableAndTodos();
            resetSubjectDetailsPanel(error.message);
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
            ctx.textAlign = 'center';
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
    
    function renderTimetableGrid(subjects) {
        timetableBody.innerHTML = '';
        subjectColorMap = {};

        let minHour = 9;
        let maxHour = 18;

        if (subjects && subjects.length > 0) {
            let earliestStartHour = 24, latestEndHour = 0;
            subjects.forEach((subject, index) => {
                if (!subjectColorMap[subject.id]) {
                    subjectColorMap[subject.id] = subjectColors[index % subjectColors.length];
                }
                subject.timeslots.forEach(ts => {
                    const startH = parseInt(ts.start.split(':')[0]), endH = parseInt(ts.end.split(':')[0]), endM = parseInt(ts.end.split(':')[1]);
                    earliestStartHour = Math.min(earliestStartHour, startH);
                    latestEndHour = Math.max(latestEndHour, (endM > 0 ? endH : endH - 1));
                });
            });
            if (earliestStartHour < 24) minHour = Math.min(minHour, earliestStartHour);
            if (latestEndHour >= 0) maxHour = Math.max(maxHour, latestEndHour + 1);
        }

        for (let h = minHour; h <= maxHour; h++) {
            const hourStr = String(h).padStart(2, '0');
            const row = document.createElement('tr');
            row.setAttribute('data-hour', hourStr);
            row.innerHTML = `<td>${hourStr}:00</td><td data-day="1"></td><td data-day="2"></td><td data-day="3"></td><td data-day="4"></td><td data-day="5"></td>`;
            timetableBody.appendChild(row);
        }

        if (subjects.length > 0) {
            positionTimetableSlots(subjects);
        } else {
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">이번 학기에 등록된 과목이 없습니다.</td></tr>`;
        }
    }

    function positionTimetableSlots(subjects) {
        requestAnimationFrame(() => {
            const firstRowCell = timetableBody.querySelector('td[data-day="1"]');
            if (!firstRowCell) { return; }
            const cellHeight = firstRowCell.offsetHeight;
            if (!cellHeight || cellHeight === 0) {
                setTimeout(() => positionTimetableSlots(subjects), 100);
                return;
            }

            subjects.forEach(subject => {
                const subjectColor = subjectColorMap[subject.id] || 'rgba(165, 0, 52, 0.15)';
                // [FIX #4] 테두리 색상을 더 진하게
                const borderColor = subjectColor.replace('0.2', '1.0');
                
                subject.timeslots.forEach(ts => {
                    const [startH, startM] = ts.start.split(':').map(Number);
                    const [endH, endM] = ts.end.split(':').map(Number);
                    const targetCell = timetableBody.querySelector(`tr[data-hour="${String(startH).padStart(2, '0')}"] td[data-day="${ts.day}"]`);
                    if (!targetCell) { return; }

                    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                    const topOffset = (startM / 60) * cellHeight;
                    const slotHeight = Math.max(10, (durationMinutes / 60) * cellHeight - 2);

                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'subject-slot';
                    slotDiv.style.top = `${topOffset}px`;
                    slotDiv.style.height = `${slotHeight}px`;
                    slotDiv.style.backgroundColor = subjectColor;
                    slotDiv.style.borderLeft = `4px solid ${borderColor}`;

                    let innerHTML = `<div class="slot-subject">${subject.name}</div>`;
                    if (slotHeight > 30) innerHTML += `<div class="slot-room">${ts.room || ''}</div>`;
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

    function renderSubjectDetailsList(subjects) {
        subjectDetailsListUl.innerHTML = '';
        if (!subjects || subjects.length === 0) {
            subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">이 학기에 등록된 과목이 없습니다.</li>';
            return;
        }
        subjects.forEach(subject => {
            const li = document.createElement('li');
            li.className = 'subject-details-item';
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
            li.addEventListener('click', () => {
                 subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
                 li.classList.add('selected');
                 selectSubjectForDetails(subject.id);
            });
             li.querySelector('.grade-select').addEventListener('change', handleGradeChange);
             li.querySelector('.grade-select').addEventListener('click', (e) => e.stopPropagation());

            subjectDetailsListUl.appendChild(li);
        });
    }

     function selectSubjectForDetails(subjectId) {
         selectedSubjectForDetails = currentSubjects.find(s => s.id === subjectId);
         if (selectedSubjectForDetails) {
             weeklyDetailsTitle.innerHTML = `<i class="fas fa-calendar-week"></i> 주차별 정보 (${selectedSubjectForDetails.name})`;
             currentWeek = 1;
             updateWeekView();
             enableWeeklyDetailsPanel();
         } else {
             resetWeeklyDetailsPanel();
         }
     }

     async function handleGradeChange(event) {
         const selectElement = event.target;
         const subjectId = parseInt(selectElement.dataset.subjectId, 10);
         const newGrade = selectElement.value;
         const subject = currentSubjects.find(s => s.id === subjectId);
         if (!subject) return;

         subject.grade = newGrade;
         const subjectMemo = subject.memo || { note: '', todos: [] };

         try {
             const timeslotsData = subject.timeslots.map(ts => ({
                day: ts.day, start: ts.start, end: ts.end, room: ts.room
             }));
             const response = await fetch(`/api/subjects/${subjectId}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                    name: subject.name, professor: subject.professor, credits: subject.credits,
                    grade: newGrade, timeslots: timeslotsData, memo: subjectMemo
                 })
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message);
             loadGpaStats();
         } catch (error) {
             alert(`등급 업데이트 실패: ${error.message}`);
         }
     }

     function changeWeek(delta) {
         const newWeek = currentWeek + delta;
         if (newWeek >= 1 && newWeek <= TOTAL_WEEKS) {
             currentWeek = newWeek;
             updateWeekView();
         }
     }
     
     async function updateWeekView() {
         prevWeekBtn.disabled = (currentWeek === 1);
         nextWeekBtn.disabled = (currentWeek === TOTAL_WEEKS);
         
         if (selectedSubjectForDetails) {
             await loadWeeklyMemoTodo();
         } else {
             currentWeekDisplay.textContent = '주차 선택';
             resetWeeklyDetailsPanel();
         }
     }

     async function loadWeeklyMemoTodo() {
         if (!selectedSubjectForDetails) return;
         weeklyMemoText.disabled = true;
         weeklyMemoText.value = '로딩 중...';
         weeklyTodoListUl.innerHTML = '<li class="todo-empty">로딩 중...</li>';
         disableWeeklyDetailsPanel();

         try {
             const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`);
             if (!response.ok) throw new Error('주차별 정보 로드 실패');
             const weeklyData = await response.json();
             if (weeklyData.status === 'success') {
                currentWeeklyData = { note: weeklyData.note || '', todos: weeklyData.todos || [] };
                currentWeekDisplay.textContent = `${weeklyData.week_date_str} (${currentWeek}주차)`;
                weeklyMemoText.value = currentWeeklyData.note;
                renderWeeklyTodoList(currentWeeklyData.todos);
                weeklyMemoSubjectName.textContent = selectedSubjectForDetails.name;
                weeklyTodoSubjectName.textContent = selectedSubjectForDetails.name;
                enableWeeklyDetailsPanel();
             } else {
                throw new Error(weeklyData.message || '데이터 로드 실패');
             }
         } catch (error) {
             console.error(`Error loading week ${currentWeek} data:`, error);
             currentWeekDisplay.textContent = `${currentWeek}주차 (로드 실패)`;
             weeklyMemoText.value = '주차 정보 로드에 실패했습니다.';
             weeklyTodoListUl.innerHTML = `<li class="todo-empty">${error.message}</li>`;
             disableWeeklyDetailsPanel();
         }
     }

     function renderWeeklyTodoList(todos) {
         weeklyTodoListUl.innerHTML = '';
         if (!todos || todos.length === 0) {
             weeklyTodoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
             return;
         }
         currentWeeklyData.todos = todos;

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
                 if (currentWeeklyData.todos[index]) {
                     currentWeeklyData.todos[index].done = e.target.checked;
                     li.classList.toggle('done', e.target.checked);
                     saveWeeklyMemoTodoBtn.disabled = false;
         saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
     }

     async function saveWeeklyMemoTodo() {
         if (!selectedSubjectForDetails) {
             alert("과목을 먼저 선택해주세요.");
             return;
         }
         currentWeeklyData.note = weeklyMemoText.value.trim();
         saveWeeklyMemoTodoBtn.disabled = true;
         saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

         try {
             const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(currentWeeklyData)
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message || '저장 실패');
             
             saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-check"></i> 저장 완료!';
             setTimeout(() => {
                 saveWeeklyMemoTodoBtn.disabled = false;
                 saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
             }, 2000);
         } catch (error) {
             console.error("Failed to save weekly memo/todo:", error);
             alert(`주차별 정보 저장 실패: ${error.message}`);
             saveWeeklyMemoTodoBtn.disabled = false;
             saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-times"></i> 저장 실패';
         }
     }
     
     // [FIX #7] 모든 주차 모아보기 모달 (월별 그룹핑)
     async function openAllWeeksModal() {
        if (!selectedSubjectForDetails) {
            alert("먼저 과목을 선택해주세요.");
            return;
        }

        const modalTitle = allWeeksModal.querySelector('.modal-header h3');
        const accordionContainer = allWeeksModal.querySelector('#allWeeksAccordion');
        
        modalTitle.textContent = `${selectedSubjectForDetails.name} - 전체 주차 정보`;
        accordionContainer.innerHTML = '<div class="loading-spinner-small"></div>';
        allWeeksModal.classList.add('active');

        try {
            const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/all-weeks`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            renderAllWeeksAccordion(result.data, accordionContainer);
        } catch (error) {
            accordionContainer.innerHTML = `<p class="todo-summary-empty">${error.message}</p>`;
        }
     }

     function renderAllWeeksAccordion(monthsData, container) {
        container.innerHTML = '';
        
        // 모든 월의 모든 주차가 비어있는지 확인
        const hasAnyContent = Object.values(monthsData).some(weeks => 
            weeks.some(week => week.note || week.todos.length > 0)
        );
        
        if (!hasAnyContent) {
            container.innerHTML = `<p class="todo-summary-empty">모든 주차에 기록된 정보가 없습니다.</p>`;
            return;
        }

        // 월별로 렌더링
        Object.keys(monthsData).forEach(monthKey => {
            const weeks = monthsData[monthKey];
            
            // 이 월에 내용이 있는 주차가 있는지 확인
            const hasMonthContent = weeks.some(week => week.note || week.todos.length > 0);
            if (!hasMonthContent) return; // 내용이 없으면 건너뜀

            // 월 헤더 추가
            const monthHeader = document.createElement('div');
            monthHeader.className = 'month-header';
            monthHeader.innerHTML = `<h3><i class="fas fa-calendar-alt"></i> ${monthKey}</h3>`;
            container.appendChild(monthHeader);

            // 해당 월의 주차들 렌더링
            weeks.forEach(week => {
                if (!week.note && week.todos.length === 0) return; // 내용이 없으면 건너뜀

                const itemDiv = document.createElement('div');
                itemDiv.className = 'accordion-item';
                itemDiv.innerHTML = `
                    <div class="accordion-header">
                        <span class="week-title">${week.week_number}주차 (${week.date_range})</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="accordion-content">
                        ${week.note ? `<h4><i class="fas fa-sticky-note"></i> 메모</h4><p>${week.note}</p>` : ''}
                        ${week.todos.length > 0 ? `
                            <h4><i class="fas fa-check-square"></i> Todo</h4>
                            <ul class="memo-todo-list">
                                ${week.todos.map(todo => `<li class="todo-item ${todo.done ? 'done' : ''}">- ${todo.task}</li>`).join('')}
                            </ul>
                        ` : ''}
                    </div>
                `;
                container.appendChild(itemDiv);
            });
        });

        // 아코디언 이벤트 리스너
        container.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                header.parentElement.classList.toggle('active');
                if (content.style.maxHeight) {
                    content.style.maxHeight = null;
                } else {
                    content.style.maxHeight = content.scrollHeight + "px";
                }
            });
        });
     }

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
         currentWeeklyData = { note: "", todos: [] };
         currentWeekDisplay.textContent = '주차 선택';
         prevWeekBtn.disabled = true;
         nextWeekBtn.disabled = (currentWeek === TOTAL_WEEKS);
         disableWeeklyDetailsPanel();
         selectedSubjectForDetails = null;
         if(subjectDetailsListUl) subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
     }
     
     function enableWeeklyDetailsPanel() {
         weeklyMemoText.disabled = false;
         weeklyNewTodoInput.disabled = false;
         weeklyAddTodoBtn.disabled = false;
         saveWeeklyMemoTodoBtn.disabled = false;
         saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
     }
     
     function disableWeeklyDetailsPanel() {
         weeklyMemoText.disabled = true;
         weeklyNewTodoInput.disabled = true;
         weeklyAddTodoBtn.disabled = true;
         saveWeeklyMemoTodoBtn.disabled = true;
         saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
     }

    function updateCreditProgress(current, goal) {
         const remaining = Math.max(0, goal - current);
         const percentage = (goal > 0) ? Math.min(100, (current / goal) * 100) : 0;
         const circumference = 2 * Math.PI * 45;
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

    function openAddSubjectModal() {
        if (!currentSemesterId) { alert("과목을 추가할 학기를 선택해주세요."); return; }
        addSubjectForm.reset();
        addSubjectSemesterIdInput.value = currentSemesterId;
        addTimeSlotContainer.innerHTML = '';
        createTimeSlotEntry(null, addTimeSlotContainer);
        addSubjectModal.classList.add('active');
    }

    function openEditSubjectModal(subjectId) {
        const subject = currentSubjects.find(s => s.id === subjectId);
        if (!subject) return;
        editSubjectIdInput.value = subject.id;
        editNameInput.value = subject.name;
        editProfInput.value = subject.professor;
        editCreditsInput.value = subject.credits;
        editGradeInput.value = subject.grade || "Not Set";
        editTimeSlotContainer.innerHTML = '';
        if (subject.timeslots.length > 0) {
            subject.timeslots.forEach(ts => createTimeSlotEntry(ts, editTimeSlotContainer));
        } else {
            createTimeSlotEntry(null, editTimeSlotContainer);
        }
        editSubjectModal.classList.add('active');
    }

    function createTimeSlotEntry(timeslot, container) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeslot-entry';
        entryDiv.innerHTML = `
            <select name="day">
                <option value="1">월</option><option value="2">화</option><option value="3">수</option>
                <option value="4">목</option><option value="5">금</option>
            </select>
            <input type="time" name="start_time" value="${timeslot ? (timeslot.start || '09:00') : '09:00'}">
            <input type="time" name="end_time" value="${timeslot ? (timeslot.end || '10:15') : '10:15'}">
            <input type="text" name="room" placeholder="강의실" value="${timeslot ? (timeslot.room || '') : ''}">
            <button type="button" class="timeslot-delete-btn">&times;</button>
        `;
        if (timeslot && timeslot.day) entryDiv.querySelector('select[name="day"]').value = timeslot.day;
        entryDiv.querySelector('.timeslot-delete-btn').addEventListener('click', () => entryDiv.remove());
        container.appendChild(entryDiv);
    }

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
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }

        saveNewSubjectBtn.disabled = true;
        try {
            const response = await fetch('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            addSubjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId);
            await loadGpaStats(); 
        } catch (error) {
            alert(`저장 실패: ${error.message}`);
        } finally {
            saveNewSubjectBtn.disabled = false;
        }
    }

    async function updateSubject() {
        const subjectId = editSubjectIdInput.value;
        const subject = currentSubjects.find(s => s.id === parseInt(subjectId, 10));
        if (!subject) return;

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
             memo: subject.memo || { note: '', todos: [] }
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }

        updateSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');
            
            const updatedSubjectData = result.subject;
            const index = currentSubjects.findIndex(s => s.id === updatedSubjectData.id);
            if (index !== -1) {
                let memo = updatedSubjectData.memo;
                if (typeof memo === 'string') memo = JSON.parse(memo);
                currentSubjects[index] = { ...updatedSubjectData, memo: memo };
            }

            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
            renderSubjectDetailsList(currentSubjects);
            
            if (selectedSubjectForDetails && selectedSubjectForDetails.id === updatedSubjectData.id) {
                 selectSubjectForDetails(updatedSubjectData.id);
                 loadGpaStats();
            } else {
                loadGpaStats();
            }
            
        } catch (error) {
            alert(`수정 실패: ${error.message}`);
        } finally {
            updateSubjectBtn.disabled = false;
        }
    }

    async function deleteSubject() {
        const subjectId = editSubjectIdInput.value;
        if (!subjectId || !confirm('정말로 이 과목을 삭제하시겠습니까? 관련된 시간표 정보도 모두 삭제됩니다.')) return;

        deleteSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');
            
            currentSubjects = currentSubjects.filter(s => s.id !== parseInt(subjectId, 10));
            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
            renderSubjectDetailsList(currentSubjects);
            
            if (selectedSubjectForDetails && selectedSubjectForDetails.id === parseInt(subjectId, 10)) {
                resetWeeklyDetailsPanel();
            }
            
            await loadGpaStats();
        } catch (error) {
            alert(`삭제 실패: ${error.message}`);
        } finally {
            deleteSubjectBtn.disabled = false;
        }
    }

    initializePage();
});; 
                     saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
                 }
             });
             li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
                 if (currentWeeklyData.todos) {
                     const indexToRemove = parseInt(e.target.dataset.index, 10);
                     currentWeeklyData.todos.splice(indexToRemove, 1);
                     renderWeeklyTodoList(currentWeeklyData.todos);
                     saveWeeklyMemoTodoBtn.disabled = false;
                     saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
                 }
             });
             weeklyTodoListUl.appendChild(li);
         });
     }

     function addWeeklyTodoItem() {
         const taskText = weeklyNewTodoInput.value.trim();
         if (taskText === '' || !selectedSubjectForDetails) return;

         const newTodo = { task: taskText, done: false };
         const emptyMsg = weeklyTodoListUl.querySelector('.todo-empty');
         if (emptyMsg) weeklyTodoListUl.innerHTML = '';
         if (!currentWeeklyData.todos) currentWeeklyData.todos = [];
         currentWeeklyData.todos.push(newTodo);
         renderWeeklyTodoList(currentWeeklyData.todos);
         weeklyNewTodoInput.value = '';
         weeklyNewTodoInput.focus();
         saveWeeklyMemoTodoBtn.disabled = false};