document.addEventListener('DOMContentLoaded', () => {

    // --- 전역 변수 ---
    let currentSemesterId = null;
    let currentSemesterInfo = null; // 현재 선택된 학기 정보 (year, season, start_date 등) 저장
    let allSemesters = [];
    let currentSubjects = [];
    let gpaChartInstance = null;
    let selectedSubjectForDetails = null; // [Req 1] 우측 메모/주차별Todo용

    let currentWeek = 1; // [Req 1] 우측 메모/주차별Todo용
    const TOTAL_WEEKS = 16;
    let currentWeeklyData = { note: "", todos: [] }; // [Req 1] 우측 메모/주차별Todo용

    // [Req 2 수정 반영] Global Todo 위젯 관련 변수 (좌측 사이드바)
    let currentGlobalTodos = []; // 이번 주 전체 Todo (DB에서 로드)
    let selectedTodoDay = new Date().getDay(); // 오늘 요일 (0:일, 1:월, ...)
    const globalTodoWidget = document.getElementById('globalTodoWidget'); // 위젯 컨테이너
    const globalTodoList = document.getElementById('globalTodoList'); // Todo 목록 UL
    const globalNewTodoInput = document.getElementById('globalNewTodoInput'); // 새 Todo 입력
    const globalAddTodoBtn = document.getElementById('globalAddTodoBtn'); // 추가 버튼
    const globalTagSuggestionOverlay = document.getElementById('globalTagSuggestionOverlay'); // @ 태그 제안 오버레이
    const globalTodoWeekRangeEl = document.getElementById('globalTodoWeekRange'); // 주차 범위 표시
    let currentWeekStartDate = null; // 현재 Todo 위젯에 표시되는 주의 시작일 (월요일)

    // 과목별 색상 팔레트 (기존 유지)
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
    // [Req 2] todoSummaryList 제거

    // 오른쪽 과목 상세 정보 사이드바 DOM
    const subjectDetailsListUl = document.getElementById('subjectDetailsList');
    const weeklyDetailsTitle = document.getElementById('weeklyDetailsTitle');
    const viewAllWeeksBtn = document.getElementById('viewAllWeeksBtn'); // [Req 2] 유지 (주차별 정보 위젯 내부로 이동)
    const prevWeekBtn = document.getElementById('prevWeekBtn'); // [Req 2] 유지 (주차별 정보 위젯 내부로 이동)
    const currentWeekDisplay = document.getElementById('currentWeekDisplay'); // [Req 2] 유지
    const nextWeekBtn = document.getElementById('nextWeekBtn'); // [Req 2] 유지
    const weeklyMemoSubjectName = document.getElementById('weeklyMemoSubjectName'); // [Req 2] 유지
    const weeklyTodoSubjectName = document.getElementById('weeklyTodoSubjectName'); // [Req 2] 유지
    const weeklyMemoText = document.getElementById('weeklyMemoText'); // [Req 2] 유지
    const weeklyTodoListUl = document.getElementById('weeklyTodoList'); // [Req 2] 유지
    const weeklyNewTodoInput = document.getElementById('weeklyNewTodoInput'); // [Req 2] 유지
    const weeklyAddTodoBtn = document.getElementById('weeklyAddTodoBtn'); // [Req 2] 유지
    const saveWeeklyMemoTodoBtn = document.getElementById('saveWeeklyMemoTodoBtn'); // [Req 2] 유지

    // 탭 DOM (좌측 위젯용)
    document.querySelectorAll('.timetable-side-content .widget-tabs .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.dataset.tab;
            const parentWidget = e.currentTarget.closest('.widget');
            if (!parentWidget) return;

            parentWidget.querySelectorAll('.widget-tabs .tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');

            parentWidget.querySelectorAll('.widget-tab-content').forEach(content => {
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

                // [Req 2 수정 반영] 과목 메모 파싱 불필요 (WeeklyMemo 사용)
                // currentSubjects.forEach(s => { ... });

                // UI 렌더링
                renderTimetableGrid(currentSubjects);
                renderSubjectDetailsList(currentSubjects);
                resetWeeklyDetailsPanel(); // 초기에는 주차별 정보 리셋
                addSubjectBtn.disabled = false; // 새 과목 추가 버튼 활성화

                // [Req 2 수정 반영] Global Todo 로드 (좌측 사이드바 위젯)
                await loadAndRenderGlobalTodos(new Date());

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
            if(globalTodoList) globalTodoList.innerHTML = `<li class="todo-empty">${error.message}</li>`; // 새 위젯에 에러 표시
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

        // [Req 2 수정 반영] 주차별 정보 위젯 이벤트 리스너
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

        // [Req 2 수정 반영] Global Todo 위젯 (좌측 사이드바) 이벤트 리스너
        if (globalTodoWidget) {
            globalTodoWidget.querySelectorAll('.global-day-selector .day-circle').forEach(button => {
                button.addEventListener('click', (e) => {
                    selectedTodoDay = parseInt(e.currentTarget.dataset.day, 10);
                    updateTodoDaySelection(selectedTodoDay);
                    renderGlobalTodoList(); // 선택된 요일 기준으로 리스트 다시 렌더링
                });
            });

            if (globalNewTodoInput) {
                globalNewTodoInput.addEventListener('input', handleGlobalTodoInputTagging); // [Req 1] @태그
                globalNewTodoInput.addEventListener('keypress', (e) => {
                     if (e.key === 'Enter') {
                        e.preventDefault();
                        // [Req 1] 오버레이 활성화 시 첫 항목 선택
                        const firstSuggestion = globalTagSuggestionOverlay?.querySelector('.suggestion-item');
                        if (globalTagSuggestionOverlay?.style.display === 'block' && firstSuggestion) {
                            selectGlobalTagSuggestion(firstSuggestion.textContent);
                        } else {
                            addGlobalTodo(); // Todo 추가
                        }
                     }
                });
                globalNewTodoInput.addEventListener('blur', () => {
                    // 약간의 딜레이 후 오버레이 숨김 (클릭 이벤트 처리 위해)
                    setTimeout(() => {
                        if (globalTagSuggestionOverlay) globalTagSuggestionOverlay.style.display = 'none';
                    }, 150);
                });
            }
            if (globalAddTodoBtn) globalAddTodoBtn.addEventListener('click', addGlobalTodo);
        }

        // 과목 선택 리스너 (이벤트 위임 사용)
        if (subjectDetailsListUl) {
             subjectDetailsListUl.addEventListener('click', (e) => {
                const li = e.target.closest('.subject-details-item');
                if (li && li.dataset.subjectId) {
                    // 등급 select나 수정 버튼 클릭이 아닌 경우에만 과목 선택 로직 실행
                    if (!e.target.closest('.grade-select') && !e.target.closest('.btn-edit-subject')) {
                        if (subjectDetailsListUl) subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
                        li.classList.add('selected');
                        selectSubjectForDetails(parseInt(li.dataset.subjectId, 10));
                    }
                }
            });
            // 등급 변경 이벤트 (이벤트 위임)
             subjectDetailsListUl.addEventListener('change', (e) => {
                 if (e.target.classList.contains('grade-select')) {
                     handleGradeChange(e);
                 }
            });
            // 수정 버튼 이벤트 (이벤트 위임)
            subjectDetailsListUl.addEventListener('click', (e) => {
                 const editBtn = e.target.closest('.btn-edit-subject');
                 if (editBtn && editBtn.dataset.subjectId) {
                     e.stopPropagation();
                     openEditSubjectModal(parseInt(editBtn.dataset.subjectId, 10));
                 }
            });
        }

        // 시간표 슬롯 클릭 리스너 (과목 선택)
        if (timetableBody) {
            timetableBody.addEventListener('click', (e) => {
                const slot = e.target.closest('.subject-slot');
                if (slot && slot.dataset.subjectId) {
                    e.stopPropagation();
                    const subjectId = parseInt(slot.dataset.subjectId, 10);
                    // 과목 목록에서 해당 항목 'selected' 처리
                    if (subjectDetailsListUl) {
                        subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
                        const selectedLi = subjectDetailsListUl.querySelector(`li[data-subject-id="${subjectId}"]`);
                        if(selectedLi) selectedLi.classList.add('selected');
                    }
                    // 상세 정보 패널 업데이트
                    selectSubjectForDetails(subjectId);
                }
            });
        }
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
        }
    }


    async function loadTimetableForSemester(semesterId) {
        if (!semesterId) {
            clearTimetableAndTodos();
            resetSubjectDetailsPanel();
            resetWeeklyDetailsPanel();
            disableGlobalTodoWidget("학기를 선택하세요.");
            currentSemesterInfo = null;
            if (addSubjectBtn) addSubjectBtn.disabled = true;
            return;
        }
        if (timetableBody) timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">시간표 로딩 중...</td></tr>`;
        if (subjectDetailsListUl) subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">과목 목록 로딩 중...</li>';
        disableGlobalTodoWidget("학기 로딩 중...");

        try {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error(`시간표 로드 실패 (${response.status})`);
            const data = await response.json();

            currentSemesterInfo = data.semester;
            currentSubjects = data.subjects || [];

            // [Req 2 수정] 과목 메모 파싱 불필요
            // currentSubjects.forEach(s => { ... });

            renderTimetableGrid(currentSubjects);
            renderSubjectDetailsList(currentSubjects);
            resetWeeklyDetailsPanel(); // 과목 선택 전까지 주차별 정보는 초기화
             if (addSubjectBtn) addSubjectBtn.disabled = false;

            // [Req 2 수정] Global Todo 로드
            await loadAndRenderGlobalTodos(new Date());

            // 학점 통계 로드
            await loadGpaStats();

        } catch (error) {
            console.error(error);
            clearTimetableAndTodos();
            resetSubjectDetailsPanel(error.message);
            resetWeeklyDetailsPanel();
            disableGlobalTodoWidget(error.message);
            currentSemesterInfo = null;
            if (addSubjectBtn) addSubjectBtn.disabled = true;
        }
    }


    // 현재 학기 과목들의 총 학점 직접 계산
    function calculateTotalCreditsFromCurrentSubjects() {
        if (!currentSubjects || currentSubjects.length === 0) return 0;
        return currentSubjects.reduce((total, subject) => {
            const credits = parseInt(subject.credits, 10) || 0;
            return total + credits;
        }, 0);
    }

    async function loadGpaStats() {
        if (!gpaChartCanvas || !creditProgressCircle || !overallGpaEl) return;
        try {
            const response = await fetch('/api/gpa-stats');
            if (!response.ok) throw new Error(`GPA 통계 로드 실패 (${response.status})`);
            const statsData = await response.json();

            const currentGoal = goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130;
            const apiCredits = statsData.total_earned_credits || 0;
            const totalCredits = apiCredits;

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
             updateCreditProgress(0, goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130);
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
            let earliestStartHour = 24, latestEndHour = -1;
            subjects.forEach((subject, index) => {
                if (!subjectColorMap[subject.id]) {
                    subjectColorMap[subject.id] = subjectColors[index % subjectColors.length];
                }
                subject.timeslots.forEach(ts => {
                    if (ts.start && ts.end) {
                        const startH = parseInt(ts.start.split(':')[0]);
                        const endH = parseInt(ts.end.split(':')[0]);
                        const endM = parseInt(ts.end.split(':')[1]);
                        earliestStartHour = Math.min(earliestStartHour, startH);
                        latestEndHour = Math.max(latestEndHour, (endM > 0 ? endH : endH - 1));
                    }
                });
            });
            if (earliestStartHour < 24) minHour = Math.min(minHour, earliestStartHour);
            if (latestEndHour >= 0) maxHour = Math.max(maxHour, latestEndHour + 1);
            else if (earliestStartHour < 24) maxHour = Math.max(maxHour, earliestStartHour + 1);
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
            if (!firstRowCell) { return; }
            const cellHeight = firstRowCell.offsetHeight;
            if (!cellHeight || cellHeight <= 0) {
                console.warn("Cell height is 0, retrying slot positioning...");
                setTimeout(() => positionTimetableSlots(subjects), 100);
                return;
            }

            subjects.forEach(subject => {
                const subjectColor = subjectColorMap[subject.id] || 'rgba(165, 0, 52, 0.1)';
                const borderColor = subjectColor.replace('0.1', '0.8'); // 테두리 색상

                subject.timeslots.forEach(ts => {
                     if (!ts.start || !ts.end || !ts.start.includes(':') || !ts.end.includes(':')) {
                         console.warn(`Invalid timeslot data for subject ${subject.name}:`, ts);
                         return;
                     }

                    const [startH, startM] = ts.start.split(':').map(Number);
                    const [endH, endM] = ts.end.split(':').map(Number);
                    const targetCell = timetableBody.querySelector(`tr[data-hour="${String(startH).padStart(2, '0')}"] td[data-day="${ts.day}"]`);
                    if (!targetCell) { return; }

                    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                    if (durationMinutes <= 0) return;

                    const topOffset = (startM / 60) * cellHeight;
                    const slotHeight = Math.max(10, (durationMinutes / 60) * cellHeight - 2);

                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'subject-slot';
                    slotDiv.style.top = `${topOffset}px`;
                    slotDiv.style.height = `${slotHeight}px`;
                    slotDiv.style.backgroundColor = subjectColor;
                    slotDiv.style.borderLeft = `4px solid ${borderColor}`;
                    slotDiv.dataset.subjectId = subject.id; // 과목 ID 저장

                    let innerHTML = `<div class="slot-subject">${subject.name}</div>`;
                    if (slotHeight > 30) innerHTML += `<div class="slot-room">${ts.room || ''}</div>`;
                    slotDiv.innerHTML = innerHTML;

                    targetCell.appendChild(slotDiv);
                });
            });
        });
    }


    function clearTimetableAndTodos() {
        if (timetableBody) timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">표시할 시간표가 없습니다.</td></tr>`;
        // [Req 2] todoSummaryList 제거
    }

    // GPA 차트 렌더링
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

    // 과목 목록 렌더링 (오른쪽 사이드바)
    function renderSubjectDetailsList(subjects) {
        if (!subjectDetailsListUl) return;
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
                    <select class="grade-select" data-subject-id="${subject.id}" title="등급 설정">
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
                <button class="btn-edit-subject" data-subject-id="${subject.id}" title="과목 수정"><i class="fas fa-edit"></i></button>
            `;
            // 이벤트 리스너는 setupEventListeners에서 위임으로 처리
            subjectDetailsListUl.appendChild(li);
        });
    }

     // 과목 선택 시 처리 (주차별 정보 패널 업데이트)
     function selectSubjectForDetails(subjectId) {
         selectedSubjectForDetails = currentSubjects.find(s => s.id === subjectId);
         if (selectedSubjectForDetails && weeklyDetailsTitle) {
             weeklyDetailsTitle.innerHTML = `<i class="fas fa-calendar-week"></i> 주차별 정보 (${selectedSubjectForDetails.name})`;

             let calculatedWeek = 1;
             if (currentSemesterInfo && currentSemesterInfo.start_date) {
                 const startDate = new Date(currentSemesterInfo.start_date);
                 calculatedWeek = calculateCurrentWeekNumber(startDate);
             } else {
                 if (currentSemesterInfo && currentSemesterInfo.name) {
                     const estimatedStartDate = estimateSemesterStartDate(currentSemesterInfo.name);
                     if (estimatedStartDate) {
                         calculatedWeek = calculateCurrentWeekNumber(estimatedStartDate);
                     }
                 }
             }
             currentWeek = calculatedWeek;

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

         subject.grade = newGrade; // 로컬 데이터 즉시 업데이트

         try {
             const timeslotsData = subject.timeslots.map(ts => ({
                day: ts.day, start: ts.start, end: ts.end, room: ts.room
             }));
             // [Req 2 수정] memo 전송 제거
             const response = await fetch(`/api/subjects/${subjectId}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                    name: subject.name, professor: subject.professor, credits: subject.credits,
                    grade: newGrade, timeslots: timeslotsData // memo 제거
                 })
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message);

             loadGpaStats(); // 서버 업데이트 성공 후, 전체 GPA 통계 다시 로드

         } catch (error) {
             alert(`등급 업데이트 실패: ${error.message}`);
             // 실패 시 원래 등급으로 되돌리기 (선택적)
             // selectElement.value = subject.grade;
         }
     }

     // 주차 변경 (-1 또는 1)
     function changeWeek(delta) {
         const newWeek = currentWeek + delta;
         if (newWeek >= 1 && newWeek <= TOTAL_WEEKS) {
             currentWeek = newWeek;
             updateWeekView(); // 변경된 주차 정보 로드
         }
     }

     // 주차별 정보 UI 업데이트 및 데이터 로드 트리거
     async function updateWeekView() {
         if (prevWeekBtn) prevWeekBtn.disabled = (currentWeek === 1);
         if (nextWeekBtn) nextWeekBtn.disabled = (currentWeek === TOTAL_WEEKS);

         if (selectedSubjectForDetails) {
             await loadWeeklyMemoTodo(); // 선택된 과목 있으면 해당 주차 데이터 로드
         } else {
            if (currentWeekDisplay) currentWeekDisplay.textContent = '주차 선택';
             resetWeeklyDetailsPanel(); // 과목 없으면 리셋
         }
     }

     // 특정 주차의 메모/Todo 데이터 로드 (API 호출)
     async function loadWeeklyMemoTodo() {
         if (!selectedSubjectForDetails || !weeklyMemoText || !weeklyTodoListUl) return;
         weeklyMemoText.disabled = true;
         weeklyMemoText.value = '로딩 중...';
         weeklyTodoListUl.innerHTML = '<li class="todo-empty">로딩 중...</li>';
         disableWeeklyDetailsPanel(); // 입력 필드 비활성화

         try {
             const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`);
             if (!response.ok) throw new Error('주차별 정보 로드 실패');
             const weeklyData = await response.json();
             if (weeklyData.status === 'success') {
                currentWeeklyData = { note: weeklyData.note || '', todos: weeklyData.todos || [] };
                if (currentWeekDisplay) currentWeekDisplay.textContent = `${weeklyData.week_date_str} (${currentWeek}주차)`;
                weeklyMemoText.value = currentWeeklyData.note;
                renderWeeklyTodoList(currentWeeklyData.todos);
                if (weeklyMemoSubjectName) weeklyMemoSubjectName.textContent = selectedSubjectForDetails.name;
                if (weeklyTodoSubjectName) weeklyTodoSubjectName.textContent = selectedSubjectForDetails.name;
                enableWeeklyDetailsPanel(); // 입력 필드 활성화
             } else {
                throw new Error(weeklyData.message || '데이터 로드 실패');
             }
         } catch (error) {
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
                 <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''} data-index="${index}">
                 <label for="${todoId}" class="todo-label">${todo.task}</label>
                 <span class="todo-delete-btn" data-index="${index}" title="삭제">&times;</span>
             `;
             li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                 const idx = parseInt(e.target.dataset.index, 10);
                 if (currentWeeklyData.todos && currentWeeklyData.todos[idx]) {
                     currentWeeklyData.todos[idx].done = e.target.checked;
                     li.classList.toggle('done', e.target.checked);
                     if (saveWeeklyMemoTodoBtn) {
                        saveWeeklyMemoTodoBtn.disabled = false;
                        saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
                     }
                 }
             });
             li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
                 if (currentWeeklyData.todos) {
                     const indexToRemove = parseInt(e.target.dataset.index, 10);
                     currentWeeklyData.todos.splice(indexToRemove, 1);
                     renderWeeklyTodoList(currentWeeklyData.todos);
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
         if (taskText === '') return;

         const newTodo = { task: taskText, done: false };
         if (weeklyTodoListUl) {
            const emptyMsg = weeklyTodoListUl.querySelector('.todo-empty');
            if (emptyMsg) weeklyTodoListUl.innerHTML = '';
         }
         if (!currentWeeklyData.todos) currentWeeklyData.todos = [];
         currentWeeklyData.todos.push(newTodo);
         renderWeeklyTodoList(currentWeeklyData.todos);
         weeklyNewTodoInput.value = '';
         weeklyNewTodoInput.focus();
         if (saveWeeklyMemoTodoBtn) {
            saveWeeklyMemoTodoBtn.disabled = false;
            saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
         }
     }

     // 주차별 메모/Todo 저장 (API 호출)
     async function saveWeeklyMemoTodo() {
         if (!selectedSubjectForDetails) {
             alert("과목을 먼저 선택해주세요.");
             return;
         }
         currentWeeklyData.note = weeklyMemoText ? weeklyMemoText.value.trim() : "";
         if (saveWeeklyMemoTodoBtn) {
            saveWeeklyMemoTodoBtn.disabled = true;
            saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
         }

         try {
             const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/week/${currentWeek}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(currentWeeklyData)
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message || '저장 실패');

             if (saveWeeklyMemoTodoBtn) {
                saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-check"></i> 저장 완료!';
                setTimeout(() => {
                     if (saveWeeklyMemoTodoBtn) {
                        saveWeeklyMemoTodoBtn.disabled = false;
                        saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-save"></i> 주차 정보 저장';
                     }
                }, 2000);
             }
         } catch (error) {
             console.error("Failed to save weekly memo/todo:", error);
             alert(`주차별 정보 저장 실패: ${error.message}`);
             if (saveWeeklyMemoTodoBtn) {
                saveWeeklyMemoTodoBtn.disabled = false;
                saveWeeklyMemoTodoBtn.innerHTML = '<i class="fas fa-times"></i> 저장 실패';
             }
         }
     }

     // '모든 주차 모아보기' 모달 열기
     async function openAllWeeksModal() {
        if (!selectedSubjectForDetails || !allWeeksModal) {
            alert("먼저 과목을 선택해주세요.");
            return;
        }

        const modalTitle = allWeeksModal.querySelector('.modal-header h3');
        const accordionContainer = allWeeksModal.querySelector('#allWeeksAccordion');

        if (modalTitle) modalTitle.textContent = `${selectedSubjectForDetails.name} - 전체 주차 정보`;
        if (accordionContainer) accordionContainer.innerHTML = '<div class="loading-spinner-small"></div>';
        allWeeksModal.classList.add('active');

        try {
            const response = await fetch(`/api/subjects/${selectedSubjectForDetails.id}/all-weeks`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            if (Array.isArray(result.data)) {
                renderAllWeeksAccordion(result.data, accordionContainer);
            } else {
                console.error("API response data is not an array:", result.data);
                throw new Error("데이터 형식이 올바르지 않습니다.");
            }
        } catch (error) {
             if (accordionContainer) accordionContainer.innerHTML = `<p class="todo-summary-empty">${error.message}</p>`;
        }
     }

    // '모든 주차 모아보기' 아코디언 렌더링
     function renderAllWeeksAccordion(allWeeksData, container) {
         if (!container) return;
        container.innerHTML = '';

        const hasAnyContent = Array.isArray(allWeeksData) && allWeeksData.some(week => (week.note && week.note.trim()) || (week.todos && week.todos.length > 0));

        if (!hasAnyContent) {
            container.innerHTML = `<p class="todo-summary-empty">모든 주차에 기록된 정보가 없습니다.</p>`;
            return;
        }

        allWeeksData.forEach(week => {
             const weekNote = week.note ? week.note.trim() : '';
             const weekTodos = week.todos || [];
            if (!weekNote && weekTodos.length === 0) return;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'accordion-item';
            itemDiv.innerHTML = `
                <div class="accordion-header">
                    <span class="week-title">${week.week_number}주차 (${week.date_range})</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="accordion-content">
                     ${weekNote ? `<h4><i class="fas fa-sticky-note"></i> 메모</h4><p>${weekNote}</p>` : ''}
                    ${weekTodos.length > 0 ? `
                        <h4 style="margin-top: ${weekNote ? '10px' : '0'};"><i class="fas fa-check-square"></i> Todo</h4>
                        <ul class="memo-todo-list" style="max-height: none; border: none; background: none; padding-left: 5px;">
                            ${weekTodos.map(todo => `<li class="todo-item ${todo.done ? 'done' : ''}" style="padding: 4px 0; border: none; align-items: flex-start;">
                                <i class="fas ${todo.done ? 'fa-check-square' : 'fa-square'}" style="margin-top: 2px; margin-right: 8px; color: ${todo.done ? 'var(--color-success)' : 'var(--text-secondary)'};"></i>
                                <span class="todo-label" style="line-height: 1.4;">${todo.task}</span>
                               </li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `;
            container.appendChild(itemDiv);
        });

        container.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const item = header.parentElement;
                const isActive = item.classList.contains('active');
                item.classList.toggle('active', !isActive);
                if (content) {
                    content.style.maxHeight = isActive ? null : content.scrollHeight + 32 + "px"; // padding 고려
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

         currentWeek = 1;
         currentWeeklyData = { note: "", todos: [] };
         if (currentWeekDisplay) currentWeekDisplay.textContent = '주차 선택';
         if (prevWeekBtn) prevWeekBtn.disabled = true;
         if (nextWeekBtn) nextWeekBtn.disabled = (TOTAL_WEEKS <= 1);
         disableWeeklyDetailsPanel();
         selectedSubjectForDetails = null;
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
         if (!currentCreditsEl || !goalCreditsEl || !remainingCreditsEl || !creditPercentageEl) return;
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

    // 목표 학점 저장
    async function saveCreditGoal() {
         if (!newGoalInput || !saveGoalBtn || !currentCreditsEl || !editGoalForm || !editGoalBtn) return;
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

    // 새 과목 추가 모달 열기
    function openAddSubjectModal() {
        if (!currentSemesterId) { alert("과목을 추가할 학기를 선택해주세요."); return; }
        if (!addSubjectModal || !addSubjectForm || !addSubjectSemesterIdInput || !addTimeSlotContainer) return;
        addSubjectForm.reset();
        addSubjectSemesterIdInput.value = currentSemesterId;
        addTimeSlotContainer.innerHTML = '';
        createTimeSlotEntry(null, addTimeSlotContainer);
        addSubjectModal.classList.add('active');
    }

    // 과목 수정 모달 열기
    function openEditSubjectModal(subjectId) {
        if (!editSubjectModal || !editSubjectIdInput || !editNameInput || !editProfInput || !editCreditsInput || !editGradeInput || !editTimeSlotContainer) return;
        const subject = currentSubjects.find(s => s.id === subjectId);
        if (!subject) return;
        editSubjectIdInput.value = subject.id;
        editNameInput.value = subject.name;
        editProfInput.value = subject.professor || '';
        editCreditsInput.value = subject.credits;
        editGradeInput.value = subject.grade || "Not Set";
        editTimeSlotContainer.innerHTML = '';
        if (subject.timeslots && subject.timeslots.length > 0) {
            subject.timeslots.forEach(ts => createTimeSlotEntry(ts, editTimeSlotContainer));
        } else {
            createTimeSlotEntry(null, editTimeSlotContainer);
        }
        editSubjectModal.classList.add('active');
    }

    // 시간/장소 입력 슬롯 생성
    function createTimeSlotEntry(timeslot, container) {
        if (!container) return;
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeslot-entry';
        entryDiv.innerHTML = `
            <select name="day" title="요일">
                <option value="1" ${timeslot && timeslot.day == 1 ? 'selected' : ''}>월</option>
                <option value="2" ${timeslot && timeslot.day == 2 ? 'selected' : ''}>화</option>
                <option value="3" ${timeslot && timeslot.day == 3 ? 'selected' : ''}>수</option>
                <option value="4" ${timeslot && timeslot.day == 4 ? 'selected' : ''}>목</option>
                <option value="5" ${timeslot && timeslot.day == 5 ? 'selected' : ''}>금</option>
            </select>
            <input type="time" name="start_time" value="${timeslot ? (timeslot.start || '09:00') : '09:00'}" title="시작 시간">
            <input type="time" name="end_time" value="${timeslot ? (timeslot.end || '10:15') : '10:15'}" title="종료 시간">
            <input type="text" name="room" placeholder="강의실" value="${timeslot ? (timeslot.room || '') : ''}" title="강의실">
            <button type="button" class="timeslot-delete-btn" title="시간 삭제">&times;</button>
        `;
        entryDiv.querySelector('.timeslot-delete-btn').addEventListener('click', () => entryDiv.remove());
        container.appendChild(entryDiv);
    }

    // 새 과목 저장
    async function saveNewSubject() {
         if (!addSubjectSemesterIdInput || !addNameInput || !addProfInput || !addCreditsInput || !addTimeSlotContainer || !saveNewSubjectBtn || !addSubjectModal) return;

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

    // 과목 정보 수정
    async function updateSubject() {
         if (!editSubjectIdInput || !editNameInput || !editProfInput || !editCreditsInput || !editGradeInput || !editTimeSlotContainer || !updateSubjectBtn || !editSubjectModal) return;

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
            // [Req 2 수정] memo 제거
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }

        updateSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');

            // 로컬 데이터 업데이트
            const updatedSubjectData = result.subject;
            const index = currentSubjects.findIndex(s => s.id === updatedSubjectData.id);
            if (index !== -1) {
                // [Req 2 수정] memo 관련 로직 제거
                 currentSubjects[index] = { ...updatedSubjectData };
            }

            // UI 다시 렌더링
            renderTimetableGrid(currentSubjects);
            renderSubjectDetailsList(currentSubjects);

            // 주차별 정보 패널 업데이트 (선택된 과목이면)
            if (selectedSubjectForDetails && selectedSubjectForDetails.id === updatedSubjectData.id) {
                 selectSubjectForDetails(updatedSubjectData.id);
            }
            await loadGpaStats();

        } catch (error) {
            alert(`수정 실패: ${error.message}`);
        } finally {
            updateSubjectBtn.disabled = false;
        }
    }

    // 과목 삭제
    async function deleteSubject() {
         if (!editSubjectIdInput || !deleteSubjectBtn || !editSubjectModal) return;

        const subjectId = editSubjectIdInput.value;
        if (!subjectId || !confirm('정말로 이 과목을 삭제하시겠습니까? 관련된 시간표, 메모, Todo 정보도 모두 삭제됩니다.')) return;

        deleteSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');

            currentSubjects = currentSubjects.filter(s => s.id !== parseInt(subjectId, 10));

            renderTimetableGrid(currentSubjects);
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

    // --- Helper Functions ---
    // 학기 이름에서 시작일 추정
    function estimateSemesterStartDate(semesterName) {
        if (!semesterName) return null;
        const match = semesterName.match(/(\d{4})년 (1|2|여름|겨울)학기/);
        if (!match) return null;
        const year = parseInt(match[1], 10);
        const season = match[2];
        if (season === '1') return new Date(year, 2, 2);
        else if (season === '2') return new Date(year, 8, 1);
        else if (season === '여름') return new Date(year, 5, 20);
        else if (season === '겨울') return new Date(year, 11, 20);
        return null;
    }

    // 현재 날짜 기준 주차 계산
    function calculateCurrentWeekNumber(startDate) {
        if (!startDate) return 1;
        const today = new Date();
        const start = new Date(startDate);
        today.setHours(0, 0, 0, 0);
        start.setHours(0, 0, 0, 0);
        const diffTime = today - start;
        if (diffTime < 0) return 1;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekNumber = Math.floor(diffDays / 7) + 1;
        return Math.max(1, Math.min(weekNumber, TOTAL_WEEKS));
    }


    // --- [Req 2 수정] Global Todo 위젯 관련 Helper Functions (좌측 사이드바) ---

    // 현재 날짜 기준 주의 시작(월)/종료(일)일 계산
    function getWeekRange(date) {
        const today = new Date(date.setHours(0,0,0,0));
        const dayOfWeek = today.getDay(); // 0:일, 1:월, ..., 6:토
        const diffToMonday = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
        const monday = new Date(new Date(today).setDate(today.getDate() + diffToMonday));
        const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));
        return { start: monday, end: sunday };
    }

    // 날짜 포맷팅 (YYYY-MM-DD)
    function formatDateYYYYMMDD(date) {
        if (!date) return '';
        return date.toISOString().split('T')[0];
    }

    // 날짜 포맷팅 (MM.DD)
    function formatDateMMDD(date) {
        if (!date) return '';
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}.${day}`;
    }

    // Global Todo 위젯 활성화
    function enableGlobalTodoWidget() {
        if (!globalTodoWidget) return;
        if(globalNewTodoInput) globalNewTodoInput.disabled = false;
        if(globalAddTodoBtn) globalAddTodoBtn.disabled = false;
    }

    // Global Todo 위젯 비활성화
    function disableGlobalTodoWidget(message = "학기를 선택하세요.") {
        if (!globalTodoWidget) return;
        if(globalNewTodoInput) { globalNewTodoInput.value = ''; globalNewTodoInput.disabled = true; }
        if(globalAddTodoBtn) globalAddTodoBtn.disabled = true;
        if(globalTodoList) globalTodoList.innerHTML = `<li class="todo-empty">${message}</li>`;
        if(globalTodoWeekRangeEl) globalTodoWeekRangeEl.textContent = "";
        currentGlobalTodos = [];
        currentWeekStartDate = null;
        hideGlobalTagSuggestions(); // 오버레이 숨기기
    }

    // Global Todo 로드 및 렌더링
    async function loadAndRenderGlobalTodos(date) {
        if (!currentSemesterId) {
            disableGlobalTodoWidget("학기를 선택하세요.");
            return;
        }
        enableGlobalTodoWidget();
        if(globalTodoList) globalTodoList.innerHTML = '<li class="todo-empty">Todo 로딩 중...</li>';

        const weekRange = getWeekRange(date);
        currentWeekStartDate = weekRange.start;
        const startDateStr = formatDateYYYYMMDD(weekRange.start);
        const endDateStr = formatDateYYYYMMDD(weekRange.end);

        if(globalTodoWeekRangeEl) {
             globalTodoWeekRangeEl.textContent = `${formatDateMMDD(weekRange.start)} ~ ${formatDateMMDD(weekRange.end)}`;
        }

        try {
            const response = await fetch(`/api/todos?semester_id=${currentSemesterId}&start_date=${startDateStr}&end_date=${endDateStr}`);
            if (!response.ok) throw new Error('Todo 로드 실패');
            const data = await response.json();

            if (data.status === 'success') {
                currentGlobalTodos = data.todos || [];
                selectedTodoDay = new Date().getDay(); // 오늘 요일로 리셋
                updateTodoDaySelection(selectedTodoDay);
                renderGlobalTodoList();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error("Failed to load global todos:", error);
            if(globalTodoList) globalTodoList.innerHTML = `<li class="todo-empty">${error.message}</li>`;
        }
    }

    // Global Todo 요일 선택 UI 업데이트
    function updateTodoDaySelection(dayIndex) { // 0:일, 1:월, ...
        if (!globalTodoWidget) return;
        globalTodoWidget.querySelectorAll('.global-day-selector .day-circle').forEach(button => {
            button.classList.toggle('active', parseInt(button.dataset.day, 10) === dayIndex);
        });
    }

    // Global Todo 리스트 렌더링 (선택된 요일 기준)
    function renderGlobalTodoList() {
        if (!globalTodoList) return;
        globalTodoList.innerHTML = '';

        if (!currentSemesterId) {
            globalTodoList.innerHTML = '<li class="todo-empty">학기를 선택하세요.</li>';
            return;
        }

        const targetDate = new Date(currentWeekStartDate);
        const dayOffset = (selectedTodoDay === 0) ? 6 : selectedTodoDay - 1;
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateStr = formatDateYYYYMMDD(targetDate);

        const todosToDisplay = currentGlobalTodos.filter(todo => todo.due_date === targetDateStr);

        if (todosToDisplay.length === 0) {
            globalTodoList.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
            return;
        }

        todosToDisplay.forEach((todo) => {
            const li = document.createElement('li');
            li.className = todo.done ? 'todo-item done' : 'todo-item';
            li.setAttribute('data-todo-id', todo.id);
            const todoId = `global-todo-${todo.id}`;

            // [Req 1] @태그 스타일링 적용
            const taggedTask = highlightTaggedSubjects(todo.task);

            li.innerHTML = `
                <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
                <label for="${todoId}" class="todo-label">${taggedTask}</label>
                <span class="todo-delete-btn" title="삭제">&times;</span>
            `;

            li.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
                const isDone = e.target.checked;
                li.classList.toggle('done', isDone);
                todo.done = isDone;
                try {
                    await fetch(`/api/todos/${todo.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ done: isDone })
                    });
                } catch (error) {
                    console.error("Todo 업데이트 실패:", error);
                    e.target.checked = !isDone;
                    li.classList.toggle('done', !isDone);
                    todo.done = !isDone;
                }
            });

            li.querySelector('.todo-delete-btn').addEventListener('click', async (e) => {
                if (!confirm("이 Todo를 삭제하시겠습니까?")) return;
                try {
                    await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' });
                    currentGlobalTodos = currentGlobalTodos.filter(t => t.id !== todo.id);
                    renderGlobalTodoList();
                } catch (error) {
                    console.error("Todo 삭제 실패:", error);
                    alert("삭제에 실패했습니다.");
                }
            });
            globalTodoList.appendChild(li);
        });
    }

    // Global Todo 항목 추가 (API 호출)
    async function addGlobalTodo() {
        if (!globalNewTodoInput || !currentSemesterId || !currentWeekStartDate) return;
        const taskText = globalNewTodoInput.value.trim();
        if (taskText === '') return;

        const targetDate = new Date(currentWeekStartDate);
        const dayOffset = (selectedTodoDay === 0) ? 6 : selectedTodoDay - 1;
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateStr = formatDateYYYYMMDD(targetDate);

        const newTodoData = {
            task: taskText,
            due_date: targetDateStr,
            semester_id: currentSemesterId
        };

        globalAddTodoBtn.disabled = true;
        globalNewTodoInput.disabled = true;

        try {
            const response = await fetch('/api/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTodoData)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            currentGlobalTodos.push(result.todo);
            renderGlobalTodoList();
            globalNewTodoInput.value = '';

        } catch (error) {
            console.error("Todo 추가 실패:", error);
            alert(`Todo 추가 실패: ${error.message}`);
        } finally {
            globalAddTodoBtn.disabled = false;
            globalNewTodoInput.disabled = false;
            globalNewTodoInput.focus();
        }
    }

    // --- [Req 1] @ 태그 관련 함수 ---
    function handleGlobalTodoInputTagging(event) {
        const input = event.target;
        const value = input.value;
        const cursorPos = input.selectionStart;
        // @ 문자 뒤부터 커서까지의 텍스트 추출
        const textBeforeCursor = value.substring(0, cursorPos);
        const atMatch = textBeforeCursor.match(/@([\wㄱ-ㅎㅏ-ㅣ가-힣]*)$/);

        if (atMatch) {
            const query = atMatch[1].toLowerCase();
            const suggestions = currentSubjects.filter(subject =>
                subject.name.toLowerCase().includes(query)
            );
            showGlobalTagSuggestions(suggestions, input);
        } else {
            hideGlobalTagSuggestions();
        }
    }

    function showGlobalTagSuggestions(suggestions, inputElement) {
        if (!globalTagSuggestionOverlay) return;
        globalTagSuggestionOverlay.innerHTML = '';
        if (suggestions.length === 0) {
            hideGlobalTagSuggestions();
            return;
        }

        suggestions.slice(0, 5).forEach(subject => { // 최대 5개 제안
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = subject.name;
            item.addEventListener('mousedown', (e) => { // click 대신 mousedown 사용 (blur 이벤트 방지)
                e.preventDefault(); // blur 이벤트 방지
                selectGlobalTagSuggestion(subject.name);
            });
            globalTagSuggestionOverlay.appendChild(item);
        });

        // 위치 조정 (input 요소 *위*에 표시)
        const inputRect = inputElement.getBoundingClientRect();
        const widgetRect = inputElement.closest('.widget').getBoundingClientRect(); // 위젯 기준 위치 계산

        globalTagSuggestionOverlay.style.display = 'block';
        globalTagSuggestionOverlay.style.left = `${inputRect.left - widgetRect.left}px`;
        globalTagSuggestionOverlay.style.width = `${inputRect.width}px`;
        // bottom: 100%는 CSS에서 처리
    }

    function hideGlobalTagSuggestions() {
        if (globalTagSuggestionOverlay) globalTagSuggestionOverlay.style.display = 'none';
    }

    function selectGlobalTagSuggestion(subjectName) {
        if (!globalNewTodoInput) return;
        const value = globalNewTodoInput.value;
        const cursorPos = globalNewTodoInput.selectionStart;
        const beforeCursor = value.substring(0, cursorPos);
        const atIndex = beforeCursor.lastIndexOf('@');
        if (atIndex === -1) return; // @가 없으면 종료

        // @부터 커서까지의 부분을 선택된 과목명으로 교체 + 뒤에 공백 추가
        const newValue = value.substring(0, atIndex + 1) + subjectName + " " + value.substring(cursorPos);
        globalNewTodoInput.value = newValue;
        hideGlobalTagSuggestions();
        globalNewTodoInput.focus();
        // 커서 위치 이동 (@과목명 뒤 + 공백 뒤)
        const newCursorPos = atIndex + 1 + subjectName.length + 1;
        globalNewTodoInput.setSelectionRange(newCursorPos, newCursorPos);
    }

    // [Req 1] Todo 텍스트에서 @태그된 과목명 하이라이팅
    function highlightTaggedSubjects(taskText) {
        if (!taskText || typeof taskText !== 'string') return taskText;
        // @와 그 뒤의 연속된 문자(공백/특수문자 제외)를 찾음
        return taskText.replace(/@([\wㄱ-ㅎㅏ-ㅣ가-힣]+)/g, (match, subjectName) => {
            // currentSubjects 배열에서 해당 이름의 과목이 있는지 확인
            const subjectExists = currentSubjects.some(s => s.name === subjectName);
            if (subjectExists) {
                // 과목이 존재하면 span 태그로 감싸 스타일 적용
                return `<span class="tagged-subject">${match}</span>`;
            } else {
                // 과목이 없으면 원래 텍스트 그대로 반환
                return match;
            }
        });
    }

    initializePage(); // 페이지 초기화 함수 실행
});