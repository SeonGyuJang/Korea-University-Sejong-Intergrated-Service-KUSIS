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
    const studyPetImage = document.getElementById('studyPetImage');
    const petLevelBadge = document.getElementById('petLevelBadge');
    const petMessage = document.getElementById('petMessage');
    const petNameDisplay = document.getElementById('petNameDisplay');
    const petHealthFill = document.getElementById('petHealthFill');
    const petHealthValue = document.getElementById('petHealthValue');
    const petMoodValue = document.getElementById('petMoodValue');
    const petStreakValue = document.getElementById('petStreakValue');
    const petExpFill = document.getElementById('petExpFill');
    const petExpText = document.getElementById('petExpText');
    const petBadges = document.getElementById('petBadges');
    const petSettingsBtn = document.getElementById('petSettingsBtn');
    const petSettingsModal = document.getElementById('petSettingsModal');
    const closePetModal = document.getElementById('closePetModal');
    const cancelPetSettings = document.getElementById('cancelPetSettings');
    const savePetSettings = document.getElementById('savePetSettings');
    const petNameInput = document.getElementById('petNameInput');
    const petTypeBtns = document.querySelectorAll('.pet-type-btn');
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
    let currentPet = null; // 펫 상태
    let selectedPetType = 'cat'; // 선택된 펫 종류

    // --- Constants ---
    const MOOD_EMOJIS = {
        'happy': '😊',
        'normal': '😐',
        'sad': '😢',
        'critical': '💔'
    };
    const MOOD_NAMES = {
        'happy': '행복',
        'normal': '보통',
        'sad': '슬픔',
        'critical': '위험'
    };
    const BADGE_INFO = {
        'week_warrior': { name: '일주일 챔피언', icon: '🏆', color: '#FFD700' },
        'month_master': { name: '한 달 마스터', icon: '👑', color: '#FF6B6B' },
        'century_champion': { name: '백일 챔피언', icon: '💎', color: '#4ECDC4' },
        'level_5_hero': { name: '레벨 5 영웅', icon: '⭐', color: '#95E1D3' },
        'max_level_legend': { name: '전설', icon: '🌟', color: '#F38181' },
        'hundred_hours': { name: '100시간 달성', icon: '⏰', color: '#AA96DA' }
    };
    const BASE_PET_IMAGE_PATH = '/static/images/'; // 펫 이미지 경로

    // --- Initialization ---
    async function initializeStudyAnalysis() {
        try {
            showLoadingState(true);
            setupEventListeners();
            currentDate.setHours(0, 0, 0, 0); // 날짜 기준은 자정으로

            // 펫 상태 로드 (실패해도 계속 진행)
            try {
                await loadPetStatus();
            } catch (petError) {
                console.warn('Pet status load failed, continuing with default:', petError);
                // 기본 펫 상태로 표시
                currentPet = {
                    pet_name: '공부친구',
                    pet_type: 'cat',
                    level: 1,
                    health: 100,
                    mood: 'happy',
                    experience: 0,
                    level_progress: 0,
                    consecutive_study_days: 0,
                    badges: [],
                    mood_message: '공부해서 펫을 키워보세요!'
                };
                updatePetDisplay();
            }

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
        } catch (error) {
            console.error('Initialization error:', error);
            showNotification('페이지 초기화 중 오류가 발생했습니다. 페이지를 새로고침해주세요.', 'error');
        } finally {
            showLoadingState(false);
        }
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

        // 펫 설정 이벤트
        if (petSettingsBtn) petSettingsBtn.addEventListener('click', openPetSettingsModal);
        if (closePetModal) closePetModal.addEventListener('click', closePetSettingsModal);
        if (cancelPetSettings) cancelPetSettings.addEventListener('click', closePetSettingsModal);
        if (savePetSettings) savePetSettings.addEventListener('click', savePetSettingsChanges);

        petTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                petTypeBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedPetType = btn.dataset.type;
            });
        });
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

        // JS에서 startDate, endDate 계산은 차트 그리드 생성용으로만 사용
        const { startDate, endDate } = getDateRange(period, date);
        
        // API로 보낼 date_str (기준 날짜)
        const dateStrForAPI = formatDateYYYYMMDD(date);

        try {
            // API 엔드포인트를 /api/study-analysis-data로 변경
            // 쿼리 파라미터를 period와 date_str로 변경
            const response = await fetch(`/api/study-analysis-data?semester_id=${currentSemesterId}&period=${period}&date_str=${dateStrForAPI}`);
            
            if (!response.ok) throw new Error('학습 데이터 로드 실패');
            const data = await response.json();

            if (data.status === 'success') {
                // API 응답 구조에 맞게 파싱
                updateTotalTimeDisplay(data.total_time || 0, period, date);
                updateStudyTimeChart(data.timeseries_data || {}, period, startDate, endDate);
                updateSubjectDistribution(data.subject_data || [], period);
            } else {
                throw new Error(data.message || '데이터 로드 실패');
            }
        } catch (error) {
            console.error(`Error loading data for ${period}:`, error);
            showNotification(`데이터 로드 실패: ${error.message}`, 'error');
            // 차트 및 표시 초기화
            updateTotalTimeDisplay(0, period, date);
            updateStudyTimeChart({labels: [], data: []}, period, startDate, endDate);
            updateSubjectDistribution([], period);
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

        // 항상 "개인 공부" 옵션 추가
        subjectSelectTimer.innerHTML = '<option value="personal">개인 공부 📚</option>';

        if (subjects && subjects.length > 0) {
            subjects.forEach(subject => {
                const option = new Option(subject.name, subject.id);
                subjectSelectTimer.add(option);
            });
        }

        // 과목이 없어도 타이머는 사용 가능 (개인 공부로 사용)
        subjectSelectTimer.disabled = false;
        if (startSubjectTimerBtn) startSubjectTimerBtn.disabled = false;
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

    function updateStudyTimeChart(timeseries_data, period, startDate, endDate) {
        if (!studyTimeChartCanvas) return;
        const ctx = studyTimeChartCanvas.getContext('2d');

        if (studyTimeChartInstance) {
            studyTimeChartInstance.destroy();
        }

        // API가 반환한 {labels: [], data: []} 객체를 바로 사용
        const labels = (timeseries_data.labels || []).map(label => new Date(label)); // 차트 x축은 Date 객체여야 함
        const data = timeseries_data.data || [];
        
        let unit = 'day';
        let tooltipFormat = 'yyyy-MM-dd';
        let chartLabel = '일일 공부 시간 (분)';
        let yAxisText = '공부 시간 (시간)';
        let chartData = [];

        switch (period) {
            case 'daily':
                chartLabel = '일일 총 공부 시간 (시간)';
                unit = 'day'; 
                tooltipFormat = 'yyyy-MM-dd (eee)';
                chartData = data.map(val => (val / 3600).toFixed(2)); // 초 -> 시간 (소수점 2자리)
                yAxisText = '공부 시간 (시간)';
                break;
            case 'weekly':
                 chartLabel = '요일별 공부 시간 (시간)';
                 unit = 'day';
                 tooltipFormat = 'MM-dd (eee)';
                 chartData = data.map(val => (val / 3600).toFixed(1)); // 초 -> 시간
                 yAxisText = '공부 시간 (시간)';
                 break;
            case 'monthly':
                 chartLabel = '일별 공부 시간 (시간)';
                 unit = 'day';
                 tooltipFormat = 'MM-dd';
                 chartData = data.map(val => (val / 3600).toFixed(1)); // 초 -> 시간
                 yAxisText = '공부 시간 (시간)';
                 break;
        }
        
        if (chartTitleEl) chartTitleEl.innerHTML = `<i class="fas fa-chart-bar"></i> ${chartLabel.split(' (')[0]}`;

        studyTimeChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: chartLabel,
                    data: chartData, 
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
                                hour: 'HH',
                                day: period === 'monthly' ? 'dd' : 'MM-dd'
                            }
                        },
                        title: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: yAxisText 
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
                                     label += context.parsed.y + ' 시간'; 
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    function updateSubjectDistribution(subjectData, period) {
        if (!subjectDistChartCanvas || !subjectStudyListUl || !subjectDistTitleEl) return;
        
        let totalSubjectSeconds = 0;
        subjectData.forEach(item => {
            totalSubjectSeconds += item.time;
        });

        const colors = [
            '#A50034', '#C7003F', '#E74C3C', '#F39C12', '#F1C40F',
            '#2ECC71', '#27AE60', '#3498DB', '#2980B9', '#9B59B6',
            '#8E44AD', '#34495E', '#2C3E50', '#95A5A6', '#7F8C8D'
        ];
        let colorIndex = 0;
        
        const backgroundColors = [];
        const labels = [];

        subjectData.sort((a, b) => b.time - a.time);

        const listItemsHtml = subjectData.map(item => {
            const { hours, minutes } = formatSecondsToHM(item.time); 
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

        let distTitle = '';
         switch (period) {
            case 'daily': distTitle = '오늘 과목별 분포'; break;
            case 'weekly': distTitle = '이번 주 과목별 분포'; break;
            case 'monthly': distTitle = '이번 달 과목별 분포'; break;
        }
        subjectDistTitleEl.innerHTML = `<i class="fas fa-pie-chart"></i> ${distTitle}`;

        if (subjectData.length > 0) {
            subjectStudyListUl.innerHTML = listItemsHtml;
        } else {
            subjectStudyListUl.innerHTML = '<li class="no-data">기록된 과목별 공부 시간이 없습니다.</li>';
        }

        if (subjectDistChartInstance) {
            subjectDistChartInstance.destroy();
        }

        if (subjectData.length > 0 && totalSubjectSeconds > 0) {
             const chartDataValues = subjectData.map(item => item.time); 

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
                    maintainAspectRatio: false, 
                    plugins: {
                        legend: { display: false }, 
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) { label += ': '; }
                                    const seconds = context.parsed;
                                    const { hours, minutes } = formatSecondsToHM(seconds);
                                    label += `${hours}h ${minutes}m`;
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
             subjectDistChartCanvas.style.display = 'none';
        }
    }

    // --- Pet System Functions ---
    async function loadPetStatus() {
        try {
            // 이전 펫 상태 저장 (비교용)
            const previousPet = currentPet ? { ...currentPet } : null;

            const response = await fetch('/api/pet/status');
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Pet status API error:', response.status, errorText);
                throw new Error(`펫 상태 로드 실패 (${response.status})`);
            }
            const data = await response.json();

            if (data.status === 'success' && data.pet) {
                currentPet = data.pet;
                updatePetDisplay(previousPet); // 이전 상태 전달
            } else {
                throw new Error(data.message || '펫 데이터 없음');
            }
        } catch (error) {
            console.error('Failed to load pet status:', error);
            // 기본 펫 상태 표시
            currentPet = {
                pet_name: '공부친구',
                pet_type: 'cat',
                level: 1,
                health: 100,
                mood: 'happy',
                experience: 0,
                level_progress: 0,
                consecutive_study_days: 0,
                badges: [],
                mood_message: '공부해서 펫을 키워보세요!'
            };
            updatePetDisplay();
            throw error; // 상위로 전파
        }
    }

    function updatePetDisplay(previousPet = null) {
        if (!currentPet) return;

        // 레벨업 감지
        const leveledUp = previousPet && previousPet.level < currentPet.level;
        const badgeEarned = previousPet &&
            (!previousPet.badges || previousPet.badges.length < currentPet.badges.length);

        // 펫 이름
        if (petNameDisplay) petNameDisplay.textContent = currentPet.pet_name;

        // 펫 이미지 (레벨에 따라)
        if (studyPetImage) {
            const petLevel = Math.min(currentPet.level, 10);
            const newSrc = `${BASE_PET_IMAGE_PATH}pet_${currentPet.pet_type}_lv${petLevel}.png`;

            // 이미지가 변경된 경우에만 업데이트
            if (studyPetImage.src !== newSrc) {
                studyPetImage.src = newSrc;
            }

            // 건강도에 따른 펫 이미지 필터 효과
            const health = currentPet.health || 0;
            if (health >= 80) {
                studyPetImage.style.filter = 'none';
                studyPetImage.style.opacity = '1';
            } else if (health >= 50) {
                studyPetImage.style.filter = 'saturate(0.8)';
                studyPetImage.style.opacity = '0.95';
            } else if (health >= 20) {
                studyPetImage.style.filter = 'saturate(0.5) brightness(0.9)';
                studyPetImage.style.opacity = '0.85';
            } else {
                studyPetImage.style.filter = 'saturate(0.3) brightness(0.7) grayscale(0.3)';
                studyPetImage.style.opacity = '0.7';
            }

            // 이미지 로드 실패 시 기본 이미지
            studyPetImage.onerror = function() {
                this.src = `${BASE_PET_IMAGE_PATH}pet_cat_lv1.png`;
            };
        }

        // 레벨 배지 (레벨업 시 애니메이션)
        if (petLevelBadge) {
            petLevelBadge.textContent = `Lv. ${currentPet.level}`;
            if (leveledUp) {
                petLevelBadge.classList.add('level-up-animation');
                setTimeout(() => petLevelBadge.classList.remove('level-up-animation'), 1000);
            }
        }

        // 건강도 (애니메이션 효과)
        if (petHealthFill) {
            const health = currentPet.health || 0;
            petHealthFill.style.width = `${health}%`;

            // 건강도에 따른 색상
            if (health >= 80) {
                petHealthFill.style.backgroundColor = '#4CAF50'; // 녹색
            } else if (health >= 50) {
                petHealthFill.style.backgroundColor = '#FFC107'; // 노란색
            } else if (health >= 20) {
                petHealthFill.style.backgroundColor = '#FF9800'; // 주황색
            } else {
                petHealthFill.style.backgroundColor = '#F44336'; // 빨간색
            }

            // 건강도 낮을 때 경고 애니메이션
            if (health < 30) {
                petHealthFill.classList.add('health-warning');
            } else {
                petHealthFill.classList.remove('health-warning');
            }
        }
        if (petHealthValue) petHealthValue.textContent = `${currentPet.health}%`;

        // 감정
        if (petMoodValue) {
            const moodEmoji = MOOD_EMOJIS[currentPet.mood] || '😐';
            const moodName = MOOD_NAMES[currentPet.mood] || '보통';
            petMoodValue.textContent = `${moodEmoji} ${moodName}`;
        }

        // 연속 공부 일수
        if (petStreakValue) {
            const days = currentPet.consecutive_study_days;
            petStreakValue.textContent = `${days}일`;

            // 연속 공부 7일 이상이면 강조
            if (days >= 7) {
                petStreakValue.style.color = '#FFD700';
                petStreakValue.style.fontWeight = '700';
            } else {
                petStreakValue.style.color = '';
                petStreakValue.style.fontWeight = '';
            }
        }

        // 경험치 바 (애니메이션)
        if (petExpFill && petExpText) {
            const progress = currentPet.level_progress || 0;
            petExpFill.style.width = `${progress}%`;
            petExpText.textContent = `EXP ${progress}%`;
        }

        // 메시지
        if (petMessage) {
            let message = currentPet.mood_message || '공부해서 펫을 키워보세요!';

            // 레벨업 시 특별 메시지
            if (leveledUp) {
                message = `🎉 레벨 ${currentPet.level}로 성장했어요!`;
                showNotification(`${currentPet.pet_name}이(가) 레벨 ${currentPet.level}이 되었습니다! 🎉`, 'success');
            }

            petMessage.textContent = message;
        }

        // 배지 표시
        updateBadgesDisplay();

        // 새 배지 획득 시 알림
        if (badgeEarned && currentPet.badges && currentPet.badges.length > 0) {
            const newBadge = currentPet.badges[currentPet.badges.length - 1];
            const badgeInfo = BADGE_INFO[newBadge];
            if (badgeInfo) {
                showNotification(`${badgeInfo.icon} 새 배지 획득: ${badgeInfo.name}!`, 'success');
            }
        }
    }

    function updateBadgesDisplay() {
        if (!petBadges || !currentPet) return;

        const badges = currentPet.badges || [];
        if (badges.length === 0) {
            petBadges.innerHTML = '<p class="no-badges">아직 획득한 배지가 없습니다</p>';
            return;
        }

        const badgesHtml = badges.map(badgeKey => {
            const badge = BADGE_INFO[badgeKey];
            if (!badge) return '';
            return `
                <div class="badge-item" style="border-color: ${badge.color};">
                    <span class="badge-icon">${badge.icon}</span>
                    <span class="badge-name">${badge.name}</span>
                </div>
            `;
        }).join('');

        petBadges.innerHTML = badgesHtml;
    }

    function openPetSettingsModal() {
        if (!petSettingsModal || !currentPet) return;

        // 현재 펫 정보로 모달 채우기
        if (petNameInput) petNameInput.value = currentPet.pet_name;

        // 현재 펫 종류 선택
        selectedPetType = currentPet.pet_type;
        petTypeBtns.forEach(btn => {
            if (btn.dataset.type === selectedPetType) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        petSettingsModal.classList.add('show');
    }

    function closePetSettingsModal() {
        if (!petSettingsModal) return;
        petSettingsModal.classList.remove('show');
    }

    async function savePetSettingsChanges() {
        const newName = petNameInput.value.trim();

        if (!newName || newName.length === 0) {
            showNotification('펫 이름을 입력해주세요.', 'warning');
            return;
        }

        try {
            showLoadingState(true);

            // 이름 변경
            if (newName !== currentPet.pet_name) {
                const nameResponse = await fetch('/api/pet/rename', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
                const nameData = await nameResponse.json();
                if (nameData.status !== 'success') {
                    throw new Error(nameData.message || '이름 변경 실패');
                }
            }

            // 종류 변경
            if (selectedPetType !== currentPet.pet_type) {
                const typeResponse = await fetch('/api/pet/change-type', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pet_type: selectedPetType })
                });
                const typeData = await typeResponse.json();
                if (typeData.status !== 'success') {
                    throw new Error(typeData.message || '펫 종류 변경 실패');
                }
            }

            // 펫 상태 다시 로드
            await loadPetStatus();
            closePetSettingsModal();
            showNotification('펫 설정이 저장되었습니다!', 'success');
            showLoadingState(false);

        } catch (error) {
            console.error('Failed to save pet settings:', error);
            showNotification(`설정 저장 실패: ${error.message}`, 'error');
            showLoadingState(false);
        }
    }

    function updateDateNavigation() {
        if (!dateNavigationDiv || !currentDateDisplay || !prevPeriodBtn || !nextPeriodBtn || !todayPeriodBtn) return;

        const today = new Date(); today.setHours(0, 0, 0, 0);

        if (currentPeriod === 'daily') {
            dateNavigationDiv.style.display = 'flex';
            currentDateDisplay.textContent = formatDateMMDD(currentDate) + ` (${getWeekdayShort(currentDate)})`;
            nextPeriodBtn.disabled = (currentDate.toDateString() === today.toDateString()); 
        } else {
             dateNavigationDiv.style.display = 'none';
        }
    }


    // --- Subject Timer Logic ---
    function startSubjectTimer() {
        if (timingSubjectId || !subjectSelectTimer || !startSubjectTimerBtn || !stopSubjectTimerBtn || !currentTimingSubjectEl) return;
        const selectedId = subjectSelectTimer.value;
        const selectedOption = subjectSelectTimer.options[subjectSelectTimer.selectedIndex];

        // 과목 선택 안 했으면 "개인 공부"로 설정
        if (!selectedId || selectedId === '' || selectedId === 'personal') {
            timingSubjectId = null; // null이면 개인 공부
            timingSubjectName = '개인 공부';
        } else {
            timingSubjectId = selectedId;
            timingSubjectName = selectedOption.text;
        }

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

        subjectTimerSeconds = 0;
        timingSubjectId = null;
        timingSubjectName = null;
        updateSubjectTimerDisplay();
        startSubjectTimerBtn.disabled = false;
        stopSubjectTimerBtn.disabled = true;
        subjectSelectTimer.disabled = false;
        currentTimingSubjectEl.textContent = '';

        if (durationToSave > 0) {
            try {
                const saveDateStr = formatDateYYYYMMDD(new Date());

                // subject_id가 null이면 개인 공부로 저장
                const requestBody = {
                    date_str: saveDateStr,
                    duration_seconds: durationToSave
                };

                if (subjectIdToSave !== null && subjectIdToSave !== undefined) {
                    requestBody.subject_id = parseInt(subjectIdToSave, 10);
                }

                const response = await fetch('/api/study-log/subject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(result.message || '공부 시간 저장 실패');
                }
                showNotification(`"${subjectNameToSave}" ${formatSecondsToHMString(durationToSave)} 공부 시간 저장됨`, 'success');

                 showLoadingState(true);
                 await loadDataForPeriod(currentPeriod, currentDate);
                 // 펫 상태 업데이트 (실패해도 계속 진행)
                 try {
                     await loadPetStatus();
                 } catch (petError) {
                     console.warn('Pet update failed after timer stop:', petError);
                 }
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
        if (selectedId && selectedId != currentSemesterId) { 
            currentSemesterId = selectedId;
            showLoadingState(true);
            await loadSubjectsForSemester(currentSemesterId);
            await loadDataForPeriod(currentPeriod, currentDate);
            showLoadingState(false);
        } else if (!selectedId) {
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
        if (hours === 0 && minutes === 0 || remainingSeconds > 0) { 
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
         endDate.setHours(23, 59, 59, 999); 
        return { startDate, endDate };
    }

     function getWeekRange(d) {
        d = new Date(d);
        d.setHours(0,0,0,0);
        const day = d.getDay(); 
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
     }


    function showNotification(message, type = 'info') {
        // 토스트 알림 생성
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${getToastIcon(type)}</div>
            <div class="toast-message">${message}</div>
            <button class="toast-close">&times;</button>
        `;

        // 토스트 컨테이너 찾기 또는 생성
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        container.appendChild(toast);

        // 닫기 버튼 이벤트
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.add('toast-hide');
            setTimeout(() => toast.remove(), 300);
        });

        // 3초 후 자동 제거
        setTimeout(() => {
            toast.classList.add('toast-hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function getToastIcon(type) {
        const icons = {
            'success': '<i class="fas fa-check-circle"></i>',
            'error': '<i class="fas fa-exclamation-circle"></i>',
            'warning': '<i class="fas fa-exclamation-triangle"></i>',
            'info': '<i class="fas fa-info-circle"></i>'
        };
        return icons[type] || icons['info'];
    }

    function showLoadingState(isLoading) {
        const overlay = document.getElementById('loadingOverlay'); 
        const loadingText = document.getElementById('loadingText');
         if (overlay) {
             if (isLoading) {
                if(loadingText) loadingText.textContent = "데이터 로딩 중...";
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
                if(loadingText) loadingText.textContent = "이동 중입니다..."; 
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
         periodTabs.forEach(tab => tab.disabled = false);
         if (prevPeriodBtn) prevPeriodBtn.disabled = false;
         if (nextPeriodBtn) nextPeriodBtn.disabled = false;
         if (todayPeriodBtn) todayPeriodBtn.disabled = false;
         updateDateNavigation(); 
    }

    function displayNoSemesterMessage() {
         if(totalStudyTimeEl) totalStudyTimeEl.textContent = "N/A";
         if(currentTimePeriodEl) currentTimePeriodEl.textContent = "등록된 학기 없음";
         if(chartTitleEl) chartTitleEl.textContent = "";
         if(subjectDistTitleEl) subjectDistTitleEl.textContent = "";
         if (studyTimeChartInstance) studyTimeChartInstance.destroy();
         if (subjectDistChartInstance) subjectDistChartInstance.destroy();
         if (subjectStudyListUl) subjectStudyListUl.innerHTML = '<li class="no-data">등록된 학기가 없습니다.</li>';
         if (petMessage) petMessage.textContent = "학기를 등록해주세요.";
         disablePageFunctionality();
    }


    // --- 페이지 초기화 실행 ---
    initializeStudyAnalysis();
});