// static/js/study_analysis.js
document.addEventListener('DOMContentLoaded', async () => {
    // --- Chart.js Global Config ---
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold', size: 14 };
    Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };

    // --- DOM Elements ---
    const semesterSelect = document.getElementById('studyAnalysisSemesterSelect');
    const periodTabs = document.querySelectorAll('.period-tabs .tab');
    const totalStudyTimeEl = document.getElementById('totalStudyTime');
    const currentTimePeriodEl = document.getElementById('currentTimePeriod');
    const chartTitleEl = document.getElementById('chartTitle');
    const studyTimeChartCanvas = document.getElementById('studyTimeChart');
    const subjectDistChartCanvas = document.getElementById('subjectDistributionChart');
    const subjectStudyListUl = document.getElementById('subjectStudyList');
    const subjectSelectTimer = document.getElementById('subjectSelectTimer');
    const startSubjectTimerBtn = document.getElementById('startSubjectTimerBtn');
    const stopSubjectTimerBtn = document.getElementById('stopSubjectTimerBtn');
    const subjectTimerDisplayEl = document.getElementById('subjectTimerDisplay');
    const currentTimingSubjectEl = document.getElementById('currentTimingSubject');
    const subjectDistTitleEl = document.getElementById('subjectDistTitle');
    const studyTreeImage = document.getElementById('studyTreeImage');
    const treeLevelInfo = document.getElementById('treeLevelInfo');
    const treeMessage = document.getElementById('treeMessage');
    const dateNavigationDiv = document.getElementById('dateNavigation');
    const prevPeriodBtn = document.getElementById('prevPeriodBtn');
    const nextPeriodBtn = document.getElementById('nextPeriodBtn');
    const todayPeriodBtn = document.getElementById('todayPeriodBtn');
    const currentDateDisplay = document.getElementById('currentDateDisplay');

    // --- State Variables ---
    let currentSemesterId = null;
    let allSemesters = [];
    let currentSubjects = [];
    let studyTimeChartInstance = null;
    let subjectDistChartInstance = null;
    let currentPeriod = 'daily'; // daily, weekly, monthly
    let currentDate = new Date(); // 기준 날짜 (오늘로 초기화)
    let subjectTimerInterval = null;
    let subjectTimerSeconds = 0;
    let timingSubjectId = null;
    let timingSubjectName = null;

    // --- Constants ---
    const TREE_THRESHOLDS = [0, 3600, 7200, 14400, 28800, 57600]; // 초 단위 (0, 1h, 2h, 4h, 8h, 16h+)
    const TREE_MESSAGES = [
        "씨앗을 심었어요! 공부해서 나무를 키워보세요!",
        "새싹이 돋아났어요! 꾸준히 공부하는 중!",
        "작은 나무가 되었어요! 계속 성장시켜봐요!",
        "나무가 제법 자랐네요! 공부 습관이 잡혔어요!",
        "튼튼한 나무로 성장했어요! 대단해요!",
        "울창한 나무가 되었어요! 꾸준함의 결실!"
    ];
    const BASE_TREE_IMAGE_PATH = '/static/images/'; // 나무 이미지 경로

    // --- Initialization ---
    async function initializeStudyAnalysis() {
        showLoadingState(true);
        setupEventListeners();
        currentDate.setHours(0, 0, 0, 0); // 날짜 기준은 자정으로
        await loadAllSemesters(); // 학기 로드 및 드롭다운 채우기

        // 초기 학기 설정 (첫 번째 학기 또는 로컬 스토리지 값)
        currentSemesterId = allSemesters.length > 0 ? allSemesters[0].id : null;
        if (semesterSelect) semesterSelect.value = currentSemesterId;

        if (currentSemesterId) {
            await loadSubjectsForSemester(currentSemesterId);
            await loadDataForPeriod(currentPeriod, currentDate); // 오늘 날짜 기준으로 초기 데이터 로드
            updateDateNavigation(); // 날짜 네비게이션 초기화
        } else {
            // 학기가 없을 경우 처리
            displayNoSemesterMessage();
        }
        showLoadingState(false);
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        if (semesterSelect) semesterSelect.addEventListener('change', handleSemesterChange);

        periodTabs.forEach(tab => {
            tab.addEventListener('click', async () => {
                currentPeriod = tab.dataset.period;
                periodTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentDate = new Date(); // 기간 변경 시 오늘 날짜로 리셋
                currentDate.setHours(0, 0, 0, 0);
                showLoadingState(true);
                await loadDataForPeriod(currentPeriod, currentDate);
                updateDateNavigation();
                showLoadingState(false);
            });
        });

        if (startSubjectTimerBtn) startSubjectTimerBtn.addEventListener('click', startSubjectTimer);
        if (stopSubjectTimerBtn) stopSubjectTimerBtn.addEventListener('click', stopSubjectTimer);

        if (prevPeriodBtn) prevPeriodBtn.addEventListener('click', () => navigatePeriod(-1));
        if (nextPeriodBtn) nextPeriodBtn.addEventListener('click', () => navigatePeriod(1));
        if (todayPeriodBtn) todayPeriodBtn.addEventListener('click', navigateToToday);
    }

    // --- Data Loading ---
    async function loadAllSemesters() {
        try {
            const response = await fetch('/api/semesters');
            if (!response.ok) throw new Error('학기 목록 로드 실패');
            allSemesters = await response.json();
            populateSemesterDropdownStudy();
        } catch (error) {
            console.error(error);
            if (semesterSelect) semesterSelect.innerHTML = `<option value="">${error.message}</option>`;
            disablePageFunctionality();
        }
    }

    async function loadSubjectsForSemester(semesterId) {
        if (!semesterId) {
            currentSubjects = [];
            populateSubjectDropdown([]);
            return;
        }
        try {
            // 시간표 관리 API 재사용
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error('과목 로드 실패');
            const data = await response.json();
            currentSubjects = data.subjects || [];
            populateSubjectDropdown(currentSubjects);
        } catch (error) {
            console.error('Failed to load subjects:', error);
            currentSubjects = [];
            populateSubjectDropdown([]);
            showNotification(`과목 로드 실패: ${error.message}`, 'error');
        }
    }

    async function loadDataForPeriod(period, date) {
        if (!currentSemesterId) {
            showNotification('학기를 먼저 선택해주세요.', 'warning');
            return;
        }

        const { startDate, endDate } = getDateRange(period, date);
        const startDateStr = formatDateYYYYMMDD(startDate);
        const endDateStr = formatDateYYYYMMDD(endDate);

        try {
            // API 엔드포인트는 app.py 수정 시 정의된 것을 사용해야 함
            // 예시: /api/study-logs-period?semester_id=...&start_date=...&end_date=...
            const response = await fetch(`/api/study-logs-period?semester_id=${currentSemesterId}&start_date=${startDateStr}&end_date=${endDateStr}`);
            if (!response.ok) throw new Error('학습 데이터 로드 실패');
            const data = await response.json();

            if (data.status === 'success') {
                updateTotalTimeDisplay(data.total_seconds || 0, period, date);
                updateStudyTimeChart(data.logs_by_date || {}, period, startDate, endDate);
                updateSubjectDistribution(data.logs_by_subject || {}, period);
                updateStudyTree(data.total_seconds_overall || 0); // 전체 누적 시간 필요
            } else {
                throw new Error(data.message || '데이터 로드 실패');
            }
        } catch (error) {
            console.error(`Error loading data for ${period}:`, error);
            showNotification(`데이터 로드 실패: ${error.message}`, 'error');
            // 차트 및 표시 초기화
            updateTotalTimeDisplay(0, period, date);
            updateStudyTimeChart({}, period, startDate, endDate);
            updateSubjectDistribution({}, period);
            updateStudyTree(0);
        }
    }

    // --- UI Update Functions ---
    function populateSemesterDropdownStudy() {
        if (!semesterSelect) return;
        semesterSelect.innerHTML = '';
        if (allSemesters.length > 0) {
            allSemesters.forEach(s => {
                const option = new Option(s.name, s.id);
                semesterSelect.add(option);
            });
            enablePageFunctionality();
        } else {
            semesterSelect.innerHTML = '<option value="">등록된 학기 없음</option>';
            disablePageFunctionality();
        }
    }

    function populateSubjectDropdown(subjects) {
        if (!subjectSelectTimer) return;
        subjectSelectTimer.innerHTML = '<option value="">과목 선택</option>';
        if (subjects && subjects.length > 0) {
            subjects.forEach(subject => {
                const option = new Option(subject.name, subject.id);
                subjectSelectTimer.add(option);
            });
            subjectSelectTimer.disabled = false;
            startSubjectTimerBtn.disabled = false;
        } else {
            subjectSelectTimer.innerHTML = '<option value="">등록된 과목 없음</option>';
            subjectSelectTimer.disabled = true;
            startSubjectTimerBtn.disabled = true;
        }
    }

    function updateTotalTimeDisplay(totalSeconds, period, date) {
        if (!totalStudyTimeEl || !currentTimePeriodEl) return;
        const { hours, minutes } = formatSecondsToHM(totalSeconds);
        totalStudyTimeEl.textContent = `${hours}h ${minutes}m`;

        let periodText = '';
        switch (period) {
            case 'daily':
                periodText = `${formatDateMMDD(date)} (${getWeekdayShort(date)}) 총 공부 시간`;
                break;
            case 'weekly':
                const weekRange = getWeekRange(date);
                periodText = `${formatDateMMDD(weekRange.start)} ~ ${formatDateMMDD(weekRange.end)} 주간 총 공부 시간`;
                break;
            case 'monthly':
                periodText = `${date.getFullYear()}년 ${date.getMonth() + 1}월 총 공부 시간`;
                break;
        }
        currentTimePeriodEl.textContent = periodText;
    }

    function updateStudyTimeChart(logsByDate, period, startDate, endDate) {
        if (!studyTimeChartCanvas) return;
        const ctx = studyTimeChartCanvas.getContext('2d');

        if (studyTimeChartInstance) {
            studyTimeChartInstance.destroy();
        }

        let labels = [];
        let data = [];
        let unit = 'day';
        let tooltipFormat = 'yyyy-MM-dd';
        let chartLabel = '일일 공부 시간 (분)';

        switch (period) {
            case 'daily':
                chartLabel = '시간별 공부 시간 (분)';
                unit = 'hour';
                tooltipFormat = 'HH:mm';
                // 시간별 데이터 생성 (0-23시)
                labels = Array.from({ length: 24 }, (_, i) => {
                    const dateWithHour = new Date(startDate);
                    dateWithHour.setHours(i, 0, 0, 0);
                    return dateWithHour;
                });
                data = Array(24).fill(0);
                const dayLog = logsByDate[formatDateYYYYMMDD(startDate)];
                if (dayLog && dayLog.details) { // 시간별 상세 데이터가 있다고 가정
                     for (const hourStr in dayLog.details) {
                        const hour = parseInt(hourStr, 10);
                        if(hour >= 0 && hour < 24) {
                             data[hour] = (dayLog.details[hourStr] / 60).toFixed(1); // 분 단위
                        }
                    }
                } else if (dayLog && dayLog.total_seconds) {
                    // 시간별 데이터가 없고 일 총합만 있을 경우, 0시에 표시 (임시)
                    data[0] = (dayLog.total_seconds / 60).toFixed(1);
                }
                break;
            case 'weekly':
                 chartLabel = '요일별 공부 시간 (시간)';
                 unit = 'day';
                 tooltipFormat = 'MM-dd (eee)';
                 const weekStart = new Date(startDate);
                 labels = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
                 data = labels.map(day => {
                     const dateStr = formatDateYYYYMMDD(day);
                     return ((logsByDate[dateStr]?.total_seconds || 0) / 3600).toFixed(1); // 시간 단위
                 });
                 break;
            case 'monthly':
                 chartLabel = '일별 공부 시간 (시간)';
                 unit = 'day';
                 tooltipFormat = 'MM-dd';
                 const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
                 const monthStart = new Date(startDate);
                 labels = Array.from({ length: daysInMonth }, (_, i) => new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1));
                 data = labels.map(day => {
                     const dateStr = formatDateYYYYMMDD(day);
                     return ((logsByDate[dateStr]?.total_seconds || 0) / 3600).toFixed(1); // 시간 단위
                 });
                 break;
        }

        if (chartTitleEl) chartTitleEl.innerHTML = `<i class="fas fa-chart-bar"></i> ${chartLabel.split(' ')[0]} 공부 기록`;

        studyTimeChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: chartLabel,
                    data: data,
                    backgroundColor: 'rgba(165, 0, 52, 0.7)',
                    borderColor: 'rgba(165, 0, 52, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: unit,
                            tooltipFormat: tooltipFormat,
                             displayFormats: {
                                hour: 'HH', // 일간
                                day: 'dd(eee)' // 주간, 월간
                            }
                        },
                         adapters: {
                            date: {
                                locale: dateFns.localeKo // date-fns 로케일 설정
                            }
                        },
                        title: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: period === 'daily' ? '공부 시간 (분)' : '공부 시간 (시간)'
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) {
                                     label += context.parsed.y + (period === 'daily' ? ' 분' : ' 시간');
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    function updateSubjectDistribution(logsBySubject, period) {
        if (!subjectDistChartCanvas || !subjectStudyListUl || !subjectDistTitleEl) return;

        const subjectData = [];
        const backgroundColors = [];
        const labels = [];
        let totalSubjectSeconds = 0;

        // 색상 팔레트
        const colors = [
            '#A50034', '#C7003F', '#E74C3C', '#F39C12', '#F1C40F',
            '#2ECC71', '#27AE60', '#3498DB', '#2980B9', '#9B59B6',
            '#8E44AD', '#34495E', '#2C3E50', '#95A5A6', '#7F8C8D'
        ];
        let colorIndex = 0;

        // 과목 데이터 처리 및 총 시간 계산
        for (const subjectId in logsBySubject) {
            const subjectLog = logsBySubject[subjectId];
            const subject = currentSubjects.find(s => s.id == subjectId); // == 사용 (타입 다를 수 있음)
            const subjectName = subject ? subject.name : `과목 ID ${subjectId}`; // 과목 이름 찾기

            if (subjectLog.total_seconds > 0) {
                subjectData.push({
                    id: subjectId,
                    name: subjectName,
                    seconds: subjectLog.total_seconds
                });
                totalSubjectSeconds += subjectLog.total_seconds;
            }
        }

        // 시간순으로 정렬
        subjectData.sort((a, b) => b.seconds - a.seconds);

        // 차트 데이터 및 레이블 생성
        const listItemsHtml = subjectData.map(item => {
            const { hours, minutes } = formatSecondsToHM(item.seconds);
            const color = colors[colorIndex % colors.length];
            backgroundColors.push(color);
            labels.push(item.name);
            colorIndex++;
            return `
                <li>
                    <span class="subject-name">
                        <span class="color-dot" style="background-color: ${color};"></span>
                        ${item.name}
                    </span>
                    <span class="subject-time">${hours}h ${minutes}m</span>
                </li>
            `;
        }).join('');

        // 제목 업데이트
        let distTitle = '';
         switch (period) {
            case 'daily': distTitle = '오늘 과목별 분포'; break;
            case 'weekly': distTitle = '이번 주 과목별 분포'; break;
            case 'monthly': distTitle = '이번 달 과목별 분포'; break;
        }
        subjectDistTitleEl.innerHTML = `<i class="fas fa-pie-chart"></i> ${distTitle}`;


        // 목록 업데이트
        if (subjectData.length > 0) {
            subjectStudyListUl.innerHTML = listItemsHtml;
        } else {
            subjectStudyListUl.innerHTML = '<li class="no-data">기록된 과목별 공부 시간이 없습니다.</li>';
        }

        // 도넛 차트 업데이트
        if (subjectDistChartInstance) {
            subjectDistChartInstance.destroy();
        }

        if (subjectData.length > 0 && totalSubjectSeconds > 0) {
             const chartDataValues = subjectData.map(item => item.seconds);

            subjectDistChartInstance = new Chart(subjectDistChartCanvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '공부 시간 (초)',
                        data: chartDataValues,
                        backgroundColor: backgroundColors,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // 크기 조절 용이하게
                    plugins: {
                        legend: { display: false }, // 범례는 목록으로 대체
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) { label += ': '; }
                                    const seconds = context.parsed;
                                    const { hours, minutes } = formatSecondsToHM(seconds);
                                    label += `${hours}h ${minutes}m`;
                                    // 백분율 추가
                                    const percentage = ((seconds / totalSubjectSeconds) * 100).toFixed(1);
                                    label += ` (${percentage}%)`;
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
            subjectDistChartCanvas.style.display = 'block';
        } else {
            // 데이터 없을 때 캔버스 숨김
             subjectDistChartCanvas.style.display = 'none';
        }
    }

    function updateStudyTree(totalSecondsOverall) {
        if (!studyTreeImage || !treeLevelInfo || !treeMessage) return;

        let level = 0;
        for (let i = TREE_THRESHOLDS.length - 1; i >= 0; i--) {
            if (totalSecondsOverall >= TREE_THRESHOLDS[i]) {
                level = i;
                break;
            }
        }

        studyTreeImage.src = `${BASE_TREE_IMAGE_PATH}tree_stage_${level}.png`;
        treeLevelInfo.textContent = `Lv. ${level}`;
        treeMessage.textContent = TREE_MESSAGES[level];

        // 레벨에 따른 스타일 변경 (옵션)
        // const treeColorVar = `--tree-level-${level}`;
        // studyTreeImage.style.filter = `drop-shadow(0 0 5px var(${treeColorVar}))`;
    }

    function updateDateNavigation() {
        if (!dateNavigationDiv || !currentDateDisplay || !prevPeriodBtn || !nextPeriodBtn || !todayPeriodBtn) return;

        const today = new Date(); today.setHours(0, 0, 0, 0);

        if (currentPeriod === 'daily') {
            dateNavigationDiv.style.display = 'flex';
            currentDateDisplay.textContent = formatDateMMDD(currentDate) + ` (${getWeekdayShort(currentDate)})`;
            nextPeriodBtn.disabled = (currentDate.toDateString() === today.toDateString()); // 오늘 이후는 비활성화
        } else {
            // 주간/월간은 아직 네비게이션 미지원 (필요 시 구현)
             dateNavigationDiv.style.display = 'none';
        }
    }


    // --- Subject Timer Logic ---
    function startSubjectTimer() {
        if (timingSubjectId || !subjectSelectTimer || !startSubjectTimerBtn || !stopSubjectTimerBtn || !currentTimingSubjectEl) return;
        const selectedId = subjectSelectTimer.value;
        const selectedOption = subjectSelectTimer.options[subjectSelectTimer.selectedIndex];

        if (!selectedId) {
            showNotification('측정할 과목을 선택해주세요.', 'warning');
            return;
        }

        timingSubjectId = selectedId;
        timingSubjectName = selectedOption.text;
        subjectTimerSeconds = 0;
        updateSubjectTimerDisplay();

        subjectTimerInterval = setInterval(() => {
            subjectTimerSeconds++;
            updateSubjectTimerDisplay();
        }, 1000);

        startSubjectTimerBtn.disabled = true;
        stopSubjectTimerBtn.disabled = false;
        subjectSelectTimer.disabled = true;
        currentTimingSubjectEl.textContent = `"${timingSubjectName}" 공부 시간 측정 중...`;
    }

    async function stopSubjectTimer() {
        if (!subjectTimerInterval || !startSubjectTimerBtn || !stopSubjectTimerBtn || !subjectSelectTimer || !currentTimingSubjectEl) return;

        clearInterval(subjectTimerInterval);
        subjectTimerInterval = null;

        const durationToSave = subjectTimerSeconds;
        const subjectIdToSave = timingSubjectId;
        const subjectNameToSave = timingSubjectName;

        // 상태 초기화
        subjectTimerSeconds = 0;
        timingSubjectId = null;
        timingSubjectName = null;
        updateSubjectTimerDisplay();
        startSubjectTimerBtn.disabled = false;
        stopSubjectTimerBtn.disabled = true;
        subjectSelectTimer.disabled = false;
        currentTimingSubjectEl.textContent = '';

        if (durationToSave > 0 && subjectIdToSave) {
            // API 호출하여 저장
            try {
                const saveDateStr = formatDateYYYYMMDD(new Date()); // 저장 날짜는 항상 오늘
                // API 엔드포인트는 app.py 수정 시 정의된 것을 사용
                // 예시: POST /api/study-time-subject
                const response = await fetch('/api/study-time-subject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subject_id: subjectIdToSave,
                        date: saveDateStr,
                        duration_seconds: durationToSave
                    })
                });
                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(result.message || '과목별 시간 저장 실패');
                }
                showNotification(`"${subjectNameToSave}" ${formatSecondsToHMString(durationToSave)} 공부 시간 저장됨`, 'success');

                // 저장 후 현재 보고 있는 기간의 데이터 다시 로드
                 showLoadingState(true);
                 await loadDataForPeriod(currentPeriod, currentDate);
                 showLoadingState(false);

            } catch (error) {
                console.error("Failed to save subject study time:", error);
                showNotification(`시간 저장 실패: ${error.message}`, 'error');
            }
        }
    }

    function updateSubjectTimerDisplay() {
        if (!subjectTimerDisplayEl) return;
        const hours = Math.floor(subjectTimerSeconds / 3600);
        const minutes = Math.floor((subjectTimerSeconds % 3600) / 60);
        const seconds = subjectTimerSeconds % 60;
        subjectTimerDisplayEl.textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // --- Handlers ---
    async function handleSemesterChange() {
        if (!semesterSelect) return;
        const selectedId = semesterSelect.value;
        if (selectedId && selectedId != currentSemesterId) { // != 사용 (문자열 비교 가능성)
            currentSemesterId = selectedId;
            showLoadingState(true);
            await loadSubjectsForSemester(currentSemesterId);
            // 현재 기간/날짜 기준으로 데이터 다시 로드
            await loadDataForPeriod(currentPeriod, currentDate);
            showLoadingState(false);
        } else if (!selectedId) {
            // 학기 선택 안 함
            currentSemesterId = null;
            disablePageFunctionality();
        }
    }

    async function navigatePeriod(direction) {
        if (currentPeriod === 'daily') {
            currentDate.setDate(currentDate.getDate() + direction);
        } else if (currentPeriod === 'weekly') {
            currentDate.setDate(currentDate.getDate() + (direction * 7));
        } else if (currentPeriod === 'monthly') {
            currentDate.setMonth(currentDate.getMonth() + direction);
        }
        showLoadingState(true);
        await loadDataForPeriod(currentPeriod, currentDate);
        updateDateNavigation();
        showLoadingState(false);
    }

    async function navigateToToday() {
         currentDate = new Date();
         currentDate.setHours(0, 0, 0, 0);
         showLoadingState(true);
         await loadDataForPeriod(currentPeriod, currentDate);
         updateDateNavigation();
         showLoadingState(false);
    }


    // --- Utility Functions ---
    function formatDateYYYYMMDD(date) {
        if (!date || isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
    }

     function formatDateMMDD(date) {
         if (!date || isNaN(date.getTime())) return '';
         const month = String(date.getMonth() + 1).padStart(2, '0');
         const day = String(date.getDate()).padStart(2, '0');
         return `${month}.${day}`;
     }

     function getWeekdayShort(date) {
         if (!date || isNaN(date.getTime())) return '';
         return date.toLocaleDateString('ko-KR', { weekday: 'short' });
     }

    function formatSecondsToHM(seconds) {
        if (isNaN(seconds) || seconds < 0) seconds = 0;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return { hours, minutes };
    }
     function formatSecondsToHMString(seconds) {
        const { hours, minutes } = formatSecondsToHM(seconds);
        const remainingSeconds = seconds % 60;
        let str = '';
        if (hours > 0) str += `${hours}시간 `;
        if (minutes > 0) str += `${minutes}분 `;
        if (hours === 0 && minutes === 0 || remainingSeconds > 0) { // 초 단위 표시 (옵션)
            str += `${remainingSeconds}초`;
        }
        return str.trim() || '0초';
    }


    function getDateRange(period, date) {
        let startDate, endDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();

        switch (period) {
            case 'daily':
                startDate = new Date(date);
                endDate = new Date(date);
                break;
            case 'weekly':
                const weekRange = getWeekRange(date);
                startDate = weekRange.start;
                endDate = weekRange.end;
                break;
            case 'monthly':
                startDate = new Date(year, month, 1);
                endDate = new Date(year, month + 1, 0);
                break;
            default: // daily
                startDate = new Date(date);
                endDate = new Date(date);
        }
         endDate.setHours(23, 59, 59, 999); // 종료일은 마지막 시간까지 포함
        return { startDate, endDate };
    }

     // 주의 시작(월요일), 종료(일요일) 날짜 구하기
     function getWeekRange(d) {
        d = new Date(d);
        d.setHours(0,0,0,0);
        const day = d.getDay(); // 0(일) ~ 6(토)
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일로 조정
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
     }


    function showNotification(message, type = 'info') { // type: 'info', 'success', 'error', 'warning'
        // 간단 알림 (기존 layout.js의 기능 사용 또는 직접 구현)
        alert(`[${type.toUpperCase()}] ${message}`);
        // 필요 시 더 정교한 알림 UI 구현
    }

    function showLoadingState(isLoading) {
        // 페이지 전체 또는 특정 영역에 로딩 오버레이 표시/숨김
        const overlay = document.getElementById('loadingOverlay'); // layout.js 의 오버레이 사용
        const loadingText = document.getElementById('loadingText');
         if (overlay) {
             if (isLoading) {
                if(loadingText) loadingText.textContent = "데이터 로딩 중...";
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
                if(loadingText) loadingText.textContent = "이동 중입니다..."; // 기본값 복원
            }
        }
    }

    function disablePageFunctionality() {
        if(subjectSelectTimer) subjectSelectTimer.disabled = true;
        if(startSubjectTimerBtn) startSubjectTimerBtn.disabled = true;
        if(stopSubjectTimerBtn) stopSubjectTimerBtn.disabled = true;
        periodTabs.forEach(tab => tab.disabled = true);
         if (prevPeriodBtn) prevPeriodBtn.disabled = true;
         if (nextPeriodBtn) nextPeriodBtn.disabled = true;
         if (todayPeriodBtn) todayPeriodBtn.disabled = true;
    }

    function enablePageFunctionality() {
         if(subjectSelectTimer) subjectSelectTimer.disabled = !(currentSubjects.length > 0);
         if(startSubjectTimerBtn) startSubjectTimerBtn.disabled = !(currentSubjects.length > 0);
         // stop 버튼은 타이머 시작 시 활성화되므로 여기서 건드리지 않음
         periodTabs.forEach(tab => tab.disabled = false);
         if (prevPeriodBtn) prevPeriodBtn.disabled = false;
         if (nextPeriodBtn) nextPeriodBtn.disabled = false;
         if (todayPeriodBtn) todayPeriodBtn.disabled = false;
         updateDateNavigation(); // 날짜 네비게이션 상태 업데이트
    }

    function displayNoSemesterMessage() {
         if(totalStudyTimeEl) totalStudyTimeEl.textContent = "N/A";
         if(currentTimePeriodEl) currentTimePeriodEl.textContent = "등록된 학기 없음";
         if(chartTitleEl) chartTitleEl.textContent = "";
         if(subjectDistTitleEl) subjectDistTitleEl.textContent = "";
         if (studyTimeChartInstance) studyTimeChartInstance.destroy();
         if (subjectDistChartInstance) subjectDistChartInstance.destroy();
         if (subjectStudyListUl) subjectStudyListUl.innerHTML = '<li class="no-data">등록된 학기가 없습니다.</li>';
         if (studyTreeImage) studyTreeImage.src = `${BASE_TREE_IMAGE_PATH}tree_stage_0.png`;
         if (treeLevelInfo) treeLevelInfo.textContent = "Lv. 0";
         if (treeMessage) treeMessage.textContent = "학기를 등록해주세요.";
         disablePageFunctionality();
    }


    // --- 페이지 초기화 실행 ---
    initializeStudyAnalysis();
});