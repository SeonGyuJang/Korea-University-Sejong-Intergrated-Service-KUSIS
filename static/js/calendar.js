// ==================== 노션 스타일 캘린더 JavaScript ====================

// 전역 변수
let calendar;
let categories = [];
let allEvents = [];
let visibleCategories = new Set();
let currentMiniCalendarDate = new Date();
let selectedEventId = null;
let selectedMiniCalendarDate = null; // 미니 캘린더에서 선택한 날짜 (초기값 null로 유지)

// 편집 상태 (NEW)
let editingTempEvent = null; // 임시 이벤트 객체

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeCalendar();
    loadCategories();
    // --- 수정: 초기 로드 시 오늘 날짜의 주를 하이라이트하기 위해 selectedMiniCalendarDate 설정 ---
    const today = new Date();
    today.setHours(0,0,0,0);
    selectedMiniCalendarDate = new Date(today); // 오늘 날짜를 기준으로 초기 하이라이트 설정
    // --- 수정 끝 ---
    renderMiniCalendar();
    setupEventListeners();
    setupKeyboardShortcuts();
    setupOutsideClickClose();
});

// ==================== FullCalendar 초기화 ====================
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek', // 주간 뷰가 디폴트
        locale: 'ko',
        headerToolbar: false, // 커스텀 툴바 사용
        editable: true,
        selectable: true,
        selectMirror: true,
        dayMaxEvents: 3,
        weekends: true,
        height: 'auto', // 부모 높이에 맞춤
        contentHeight: 'auto', // 내용에 맞게 높이 자동 조절
        nowIndicator: true, // 현재 시간 표시
        slotMinTime: '06:00:00',
        slotMaxTime: '24:00:00',
        slotDuration: '00:30:00',
        slotLabelInterval: '01:00',
        slotLabelFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        },
        eventTimeFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        },
        selectMinDistance: 5, // 5px 이상 드래그해야 선택

        // 드래그로 일정 생성 (NEW)
        select: function(info) {
            createEventByDrag(info.start, info.end, info.allDay);
            calendar.unselect();
        },

        // 날짜 클릭 (빈 공간)
        dateClick: function(info) {
            // 주간/일간 뷰에서는 select 이벤트로 처리
            // 월간 뷰에서만 빠른 추가 모달 표시
            if (calendar.view.type === 'dayGridMonth') {
                showQuickEventModal(info.dateStr);
            }
        },

        // 이벤트 클릭
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            // 임시 이벤트 클릭 시 무시 (이미 패널 열림)
            if (isTemp) {
                return;
            }

            if (isSystem) {
                showEventPreview(info.event);
            } else {
                openSidePanel(eventId);
            }
        },

        // 드래그 앤 드롭
        eventDrop: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 이동할 수 없습니다.');
                return;
            }

            // 임시 이벤트 드래그 시 폼 업데이트
            if (isTemp) {
                updateFormFromTempEvent(info.event);
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 리사이즈
        eventResize: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 수정할 수 없습니다.');
                return;
            }

            // 임시 이벤트 리사이즈 시 폼 업데이트
            if (isTemp) {
                updateFormFromTempEvent(info.event);
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 날짜 변경 시
        datesSet: function(info) {
            updateMainTitle(info.view.title);
            loadEventsInRange(info.start, info.end);
            // 메인 캘린더 날짜 변경 시 미니 캘린더의 선택된 날짜도 업데이트
            const newDate = calendar.getDate();
            selectedMiniCalendarDate = new Date(newDate); // 메인 캘린더의 현재 날짜로 설정
            selectedMiniCalendarDate.setHours(0,0,0,0);
            renderMiniCalendar(); // 미니 캘린더 다시 렌더링 (하이라이트 업데이트 포함)
        },

        // 이벤트 소스
        events: function(info, successCallback, failureCallback) {
            const filteredEvents = allEvents.filter(event =>
                visibleCategories.has(event.extendedProps.category_id)
            );
            successCallback(filteredEvents);
        },

        // 이벤트가 DOM에 렌더링된 후 실행 (색상 강제 적용)
        eventDidMount: function(info) {
            const event = info.event;
            const el = info.el;

            // 배경색과 테두리색 강제 적용
            if (event.backgroundColor) {
                el.style.backgroundColor = event.backgroundColor;
                el.style.borderColor = event.borderColor || event.backgroundColor;
                el.style.opacity = '1';
            }

            // 시스템 이벤트인 경우 스타일 추가
            if (event.extendedProps.is_system) {
                el.style.fontWeight = '600';
                el.style.cursor = 'pointer';
            }
        }
    });

    calendar.render();
}

// ==================== 미니 캘린더 ====================
function renderMiniCalendar() {
    const miniCalendar = document.getElementById('miniCalendar');
    const year = currentMiniCalendarDate.getFullYear();
    const month = currentMiniCalendarDate.getMonth();
    const today = new Date(); // 오늘 날짜
    today.setHours(0,0,0,0); // 시간 초기화

    // 헤더 업데이트
    document.getElementById('miniCalendarTitle').textContent =
        `${year}년 ${month + 1}월`;

    // --- 주 하이라이트 로직 수정 ---
    // 하이라이트할 날짜 결정: selectedMiniCalendarDate (클릭된 날짜 또는 초기 오늘 날짜) 사용
    const dateToHighlight = selectedMiniCalendarDate;
    const weekRangeToHighlight = dateToHighlight ? getWeekRangeForDate(dateToHighlight) : null;
    // --- 수정 끝 ---

    // 그리드 생성
    const firstDayOfMonth = new Date(year, month, 1);
    const firstDayWeekday = firstDayOfMonth.getDay(); // 0:일요일, 6:토요일
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    const lastDateOfPrevMonth = new Date(year, month, 0).getDate();

    let html = '<div class="mini-calendar-grid">';

    // 요일 헤더
    ['일', '월', '화', '수', '목', '금', '토'].forEach(day => {
        html += `<div class="mini-calendar-weekday">${day}</div>`;
    });

    // 이전 달 날짜
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
        html += `<div class="mini-calendar-day other-month">${lastDateOfPrevMonth - i}</div>`;
    }

    // 현재 달 날짜
    for (let day = 1; day <= lastDateOfMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isToday = date.toDateString() === today.toDateString();

        // 해당 날짜에 이벤트가 있는지 확인 (표시 중인 카테고리만)
        const hasEvents = allEvents.some(e => {
            if (!visibleCategories.has(e.extendedProps.category_id)) return false;
            const eventStart = e.start.split('T')[0];
            const eventEnd = e.end ? e.end.split('T')[0] : null;
            if (eventStart === dateStr) return true;
            if (eventEnd && eventStart <= dateStr && dateStr <= eventEnd) return true; // 기간 이벤트 포함
            return false;
        });

        // 클릭된 날짜인지 확인
        const isClicked = selectedMiniCalendarDate &&
            formatDate(selectedMiniCalendarDate) === dateStr;

        let classes = 'mini-calendar-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';
        // --- 수정: 클릭된 날짜 클래스 이름 변경 ('selected' -> 'clicked-date') ---
        if (isClicked) classes += ' clicked-date';
        // --- 수정 끝 ---

        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    // 다음 달 날짜
    const totalCells = firstDayWeekday + lastDateOfMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
        html += `<div class="mini-calendar-day other-month">${day}</div>`;
    }

    // --- 주 하이라이트 계산 및 추가 (수정) ---
    // 하이라이트할 주의 정보 계산
    const highlightInfo = calculateHighlightInfo(weekRangeToHighlight, year, month, firstDayWeekday);

    // 하이라이트 알약 배경 추가 (단일 요소)
    if (highlightInfo) {
        // --- 수정: `selected-week-highlight` 대신 `week-highlight` 사용 ---
        html += `<div class="week-highlight" style="grid-row: ${highlightInfo.row}; grid-column: ${highlightInfo.colStart} / ${highlightInfo.colEnd};"></div>`;
        // --- 수정 끝 ---
    }
    // --- 주 하이라이트 끝 ---


    html += '</div>'; // mini-calendar-grid 닫기
    miniCalendar.innerHTML = html;

    // 날짜 클릭 이벤트
    miniCalendar.querySelectorAll('.mini-calendar-day:not(.other-month)').forEach(dayEl => {
        dayEl.addEventListener('click', function() {
            const dateStr = this.dataset.date;
            selectedMiniCalendarDate = new Date(dateStr + 'T00:00:00'); // 시간 정보 추가하여 정확한 Date 객체 생성
            selectedMiniCalendarDate.setHours(0,0,0,0); // 시간 초기화
            calendar.gotoDate(dateStr); // 메인 캘린더 이동
            renderMiniCalendar(); // 미니 캘린더 다시 렌더링 (클릭된 날짜 및 주 하이라이트 업데이트)
        });
    });
}

// 주 하이라이트 위치 계산 함수 (기존 로직 유지)
function calculateHighlightInfo(weekRange, currentYear, currentMonth, firstDayWeekday) {
    if (!weekRange) return null;

    const weekStart = weekRange.start;
    const weekEnd = weekRange.end;

    // 현재 표시 중인 월의 범위
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    // 주가 현재 월과 겹치는지 확인
    if (weekEnd >= monthStart && weekStart <= monthEnd) {
        let firstDayInMonth = null;
        let lastDayInMonth = null;

        // 주의 날짜들을 순회하며 현재 월에 속하는 첫날과 마지막날 찾기
        for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                if (!firstDayInMonth) firstDayInMonth = new Date(d);
                lastDayInMonth = new Date(d);
            }
        }

        if (firstDayInMonth && lastDayInMonth) {
            const startDay = firstDayInMonth.getDate();
            // 그리드에서의 첫 셀 인덱스 계산 (0-based)
            const startCellIndex = firstDayWeekday + startDay - 1;
            const startRow = Math.floor(startCellIndex / 7);

            // 해당 주가 이 월에서 시작하는 요일 (0=일요일 ~ 6=토요일)
            // 주의 시작일이 이 달보다 이전이면 0(일요일)부터 시작
            const effectiveStartDayOfWeek = (weekStart < monthStart) ? 0 : weekStart.getDay();
            // 해당 주가 이 월에서 끝나는 요일 (0=일요일 ~ 6=토요일)
            // 주의 종료일이 이 달보다 이후면 6(토요일)까지 끝남
            const effectiveEndDayOfWeek = (weekEnd > monthEnd) ? 6 : weekEnd.getDay();

            return {
                row: startRow + 2, // +2는 CSS Grid가 1-based이고 요일 헤더가 1번 행이기 때문
                colStart: effectiveStartDayOfWeek + 1, // CSS Grid는 1-based
                colEnd: effectiveEndDayOfWeek + 2 // +2는 CSS Grid의 end가 exclusive이기 때문
            };
        }
    }
    return null;
}


// ==================== 이벤트 리스너 설정 ====================
function setupEventListeners() {
    // 검색 기능 제거됨

    // 미니 캘린더 네비게이션
    document.getElementById('miniPrevMonth').addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() - 1);
        renderMiniCalendar();
    });

    document.getElementById('miniNextMonth').addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() + 1);
        renderMiniCalendar();
    });

    // 오늘 버튼
    document.getElementById('todayBtn').addEventListener('click', function() {
        const today = new Date();
        today.setHours(0,0,0,0); // 시간 초기화
        currentMiniCalendarDate = new Date(today);
        selectedMiniCalendarDate = new Date(today); // 오늘 날짜를 선택된 날짜로 설정
        calendar.today();
        renderMiniCalendar(); // 오늘 날짜 선택 반영하여 미니캘린더 다시 렌더링
    });


    // 뷰 전환
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            calendar.changeView(view);

            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // 카테고리 추가 버튼
    document.getElementById('addCategoryBtn').addEventListener('click', openCategoryModal);

    // 사이드 패널 닫기
    document.getElementById('closePanelBtn').addEventListener('click', closeSidePanel);
    document.getElementById('cancelEventBtn').addEventListener('click', closeSidePanel);

    // 일정 폼 제출
    document.getElementById('eventForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveEvent();
    });

    // 일정 삭제
    document.getElementById('deleteEventBtn').addEventListener('click', function() {
        if (confirm('이 일정을 삭제하시겠습니까?')) {
            deleteEvent(selectedEventId);
        }
    });

    // 종일 체크박스
    document.getElementById('eventAllDay').addEventListener('change', function() {
        const isAllDay = this.checked;
        document.getElementById('eventStartTime').style.display = isAllDay ? 'none' : 'block';
        document.getElementById('eventEndTime').style.display = isAllDay ? 'none' : 'block';

        // 실시간 바인딩: 임시 이벤트 업데이트
        if (editingTempEvent) {
            updateTempEventFromForm();
        }
    });

    // 실시간 바인딩 설정 (NEW)
    setupRealtimeBinding();

    // 반복 일정 선택
    document.getElementById('eventRecurrence').addEventListener('change', function() {
        const hasRecurrence = this.value !== '';
        document.getElementById('recurrenceOptions').style.display = hasRecurrence ? 'block' : 'none';
    });

    // 빠른 추가 모달
    document.getElementById('closeQuickModalBtn').addEventListener('click', closeQuickEventModal);
    document.getElementById('quickEventForm').addEventListener('submit', function(e) {
        e.preventDefault();
        quickAddEvent();
    });
    document.getElementById('quickDetailBtn').addEventListener('click', function() {
        // 빠른 추가에서 상세 설정으로 전환
        const dateStr = document.getElementById('quickEventDate').value;
        const title = document.getElementById('quickEventTitle').value;
        const categoryId = document.getElementById('quickEventCategory').value;

        closeQuickEventModal();
        openSidePanel(null, dateStr, title, categoryId);
    });

    // 카테고리 모달
    document.getElementById('closeCategoryModalBtn').addEventListener('click', closeCategoryModal);
    document.getElementById('cancelCategoryBtn').addEventListener('click', closeCategoryModal);
    document.getElementById('categoryForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveCategory();
    });

    // 색상 선택
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('categoryColor').value = this.dataset.color;
        });
    });

    // 모달 오버레이 클릭 시 닫기
    document.getElementById('categoryModalOverlay').addEventListener('click', function(e) {
        if (e.target === this) {
            closeCategoryModal();
        }
    });

    document.getElementById('quickEventModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeQuickEventModal();
        }
    });
}

// ==================== 키보드 단축키 ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // 입력 필드에 포커스가 있으면 단축키 무시 (ESC 제외)
        const isInputFocused = document.activeElement && (
            document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.tagName === 'SELECT'
        );

        // ESC 키 단축키는 항상 작동
        if (e.code === 'Escape') {
            // 열려있는 모달이나 패널 확인 후 닫기
            if (document.getElementById('panelEditView').style.display !== 'none') {
                closeSidePanel();
            } else if (document.getElementById('quickEventModal').classList.contains('active')) {
                closeQuickEventModal();
            } else if (document.getElementById('categoryModalOverlay').classList.contains('active')) {
                closeCategoryModal();
            }
            return; // ESC는 다른 단축키와 중복 실행되지 않도록 여기서 종료
        }
        // --- 수정: '\' 키 (Backslash) 단축키 로직 수정 - 윈도우/맥 호환 ---
        // Backslash 또는 Won 키는 입력 필드 포커스와 관계없이 작동
        if (e.code === 'Backslash' || e.code === 'IntlBackslash') { // '\' 키 또는 '₩' 키 - 사이드바 토글
            e.preventDefault(); // 기본 동작(입력) 방지
            toggleSidebar(); // 사이드바 토글 함수 호출 
            return; // 사이드바 토글 후 다른 단축키 로직 실행 방지
        }
        // --- 수정 끝 ---


        // 나머지 단축키는 입력 필드 외부에서만 작동
        if (isInputFocused) return;

        // 단축키 로직 (e.key 대신 e.code 사용)
        switch (e.code) {
            case 'KeyN': // N - 새 일정 (오늘 날짜)
                e.preventDefault();
                const todayForN = formatDate(new Date());
                showQuickEventModal(todayForN);
                break;
            case 'KeyT': // T - 오늘로 이동
                e.preventDefault();
                const todayForT = new Date();
                todayForT.setHours(0,0,0,0); // 시간 초기화
                currentMiniCalendarDate = new Date(todayForT);
                selectedMiniCalendarDate = new Date(todayForT); // 오늘 날짜 선택
                calendar.today();
                renderMiniCalendar(); // 오늘 날짜 선택 반영
                showNotification('오늘로 이동했습니다.');
                break;
            case 'KeyW': // W - 주간 뷰
                e.preventDefault();
                calendar.changeView('timeGridWeek');
                updateViewButtons('timeGridWeek');
                break;
            case 'KeyM': // M - 월간 뷰
                e.preventDefault();
                calendar.changeView('dayGridMonth');
                updateViewButtons('dayGridMonth');
                break;
            case 'KeyD': // D - 일간 뷰
                e.preventDefault();
                calendar.changeView('timeGridDay');
                updateViewButtons('timeGridDay');
                break;
            case 'ArrowLeft': // 좌 화살표 - 이전
                e.preventDefault();
                calendar.prev();
                break;
            case 'ArrowRight': // 우 화살표 - 다음
                e.preventDefault();
                calendar.next();
                break;
            // '\' 키 로직 위로 이동
        }
    });
}


// 뷰 버튼 UI 업데이트
function updateViewButtons(viewType) {
    document.querySelectorAll('.view-btn').forEach(btn => {
        if (btn.dataset.view === viewType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// --- 사이드바 토글 함수 (수정) ---
function toggleSidebar() {
    // --- 수정: 왼쪽 사이드바(`.calendar-sidebar`)를 토글하도록 수정 ---
    const sidebar = document.querySelector('.calendar-sidebar');
    const main = document.querySelector('.calendar-main');
    const sidePanel = document.querySelector('.side-panel'); // 우측 패널은 유지
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        // 메인 영역과 우측 패널에도 클래스를 토글하여 스타일 조정
        main?.classList.toggle('sidebar-collapsed');
        sidePanel?.classList.toggle('sidebar-collapsed'); // 우측 패널도 영향받음

        // FullCalendar 크기 재조정
        setTimeout(() => {
            if (calendar) {
                calendar.updateSize();
            }
        }, 300); // CSS transition 시간에 맞춰 조정 (0.3s)
    }
    // --- 수정 끝 ---
}


// ==================== 카테고리 관리 ====================
async function loadCategories() {
    try {
        const response = await fetch('/api/calendar/categories');
        const data = await response.json();

        if (data.status === 'success') {
            categories = data.categories;

            // 모든 카테고리 기본 표시
            visibleCategories.clear();
            categories.forEach(cat => visibleCategories.add(cat.id));

            renderCategories();
            renderCategorySelect();
        }
    } catch (error) {
        console.error('카테고리 로드 실패:', error);
        showNotification('카테고리를 불러오는 중 오류가 발생했습니다.');
    }
}

function renderCategories() {
    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = '';

    categories.forEach(category => {
        const isActive = visibleCategories.has(category.id);
        const item = document.createElement('div');
        item.className = `category-item ${isActive ? 'active' : ''}`;
        item.style.setProperty('--category-color', category.color);

        item.innerHTML = `
            <div class="category-checkbox"></div>
            <div class="category-color-dot"></div>
            <span class="category-name">${category.name}</span>
            ${category.is_system ? '<span class="category-badge">시스템</span>' : ''}
            ${!category.is_system ? `
                <div class="category-actions">
                    <button class="icon-btn delete-btn" onclick="deleteCategory(${category.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        `;

        item.addEventListener('click', function(e) {
            if (!e.target.closest('.category-actions')) {
                toggleCategoryVisibility(category.id);
            }
        });

        categoryList.appendChild(item);
    });
}

function toggleCategoryVisibility(categoryId) {
    if (visibleCategories.has(categoryId)) {
        visibleCategories.delete(categoryId);
    } else {
        visibleCategories.add(categoryId);
    }

    renderCategories();
    calendar.refetchEvents();
}

function renderCategorySelect() {
    const selects = [
        document.getElementById('eventCategory'),
        document.getElementById('quickEventCategory')
    ];

    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '';

        categories.filter(cat => !cat.is_system).forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
    });
}

// ==================== 이벤트 관리 ====================
async function loadEventsInRange(start, end) {
    try {
        // FullCalendar의 start/end는 Date 객체일 수 있으므로 포맷팅
        const startStr = formatDate(new Date(start));
        const endStr = formatDate(new Date(end));


        const response = await fetch(`/api/calendar/events?start=${startStr}&end=${endStr}`);
        const data = await response.json();

        if (data.status === 'success') {
            allEvents = data.events;
            calendar.refetchEvents();
            renderMiniCalendar(); // 이벤트 로드 후 미니캘린더 업데이트 (has-events 반영)
        }
    } catch (error) {
        console.error('이벤트 로드 실패:', error);
    }
}


// ==================== 중앙 빠른 추가 모달 ====================
function showQuickEventModal(dateStr) {
    const modal = document.getElementById('quickEventModal');
    document.getElementById('quickEventDate').value = dateStr;
    document.getElementById('quickEventTitle').value = '';

    // 첫 번째 카테고리 선택
    const firstUserCategory = categories.find(cat => !cat.is_system);
    if (firstUserCategory) {
        document.getElementById('quickEventCategory').value = firstUserCategory.id;
    }

    modal.classList.add('active');
    setTimeout(() => {
        document.getElementById('quickEventTitle').focus();
    }, 100);
}

function closeQuickEventModal() {
    document.getElementById('quickEventModal').classList.remove('active');
}

async function quickAddEvent() {
    const title = document.getElementById('quickEventTitle').value.trim();
    const dateStr = document.getElementById('quickEventDate').value;
    const categoryId = document.getElementById('quickEventCategory').value;

    if (!title || !categoryId) {
        showNotification('제목과 카테고리를 입력해주세요.');
        return;
    }

    const eventData = {
        title: title,
        category_id: parseInt(categoryId),
        description: '',
        start_date: dateStr,
        end_date: null,
        all_day: true,
        start_time: null,
        end_time: null,
        recurrence_type: null,
        recurrence_end_date: null
    };

    try {
        const response = await fetch('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();

        if (data.status === 'success') {
            closeQuickEventModal();
            refreshEvents();
            showNotification('일정이 추가되었습니다.');
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('빠른 추가 실패:', error);
        showNotification('일정 추가 중 오류가 발생했습니다.');
    }
}

// ==================== 사이드 패널 ====================
function openSidePanel(eventId = null, dateStr = null, title = '', categoryId = null) {
    const form = document.getElementById('eventForm');
    const deleteBtn = document.getElementById('deleteEventBtn');

    form.reset();
    selectedEventId = eventId;

    // 반복 일정 옵션 초기화
    document.getElementById('eventRecurrence').value = '';
    document.getElementById('recurrenceOptions').style.display = 'none';
    document.getElementById('eventRecurrenceEndDate').value = '';


    if (eventId) {
        // 수정 모드
        loadEventToForm(eventId);
        deleteBtn.style.display = 'flex';
    } else {
        // 추가 모드
        const today = dateStr || formatDate(new Date());
        document.getElementById('eventStartDate').value = today;
        document.getElementById('eventEndDate').value = ''; // 종료 날짜 초기화
        document.getElementById('eventAllDay').checked = true; // 종일 기본 체크
        if (title) document.getElementById('eventTitle').value = title;
        if (categoryId) document.getElementById('eventCategory').value = categoryId;
        else { // 기본 카테고리 설정
             const firstUserCategory = categories.find(cat => !cat.is_system);
             if (firstUserCategory) document.getElementById('eventCategory').value = firstUserCategory.id;
        }

        deleteBtn.style.display = 'none';

        // 종일 체크 상태에 따라 시간 입력 필드 표시/숨김
        document.getElementById('eventStartTime').style.display = 'none';
        document.getElementById('eventEndTime').style.display = 'none';
    }

    // 패널 뷰 전환 (기본 → 편집)
    showEditView();
}


function closeSidePanel() {
    // 임시 이벤트 제거
    if (editingTempEvent) {
        const idx = allEvents.findIndex(e => e.id === editingTempEvent.id);
        if (idx !== -1) {
            allEvents.splice(idx, 1);
            calendar.refetchEvents();
        }
        editingTempEvent = null;
    }

    selectedEventId = null;

    // 패널 뷰 전환 (편집 → 기본)
    showDefaultView();
}

// 외부 클릭으로 사이드 패널 닫기
function setupOutsideClickClose() {
    document.addEventListener('click', function(e) {
        // 편집 중인 임시 이벤트가 없으면 무시
        if (!editingTempEvent) return;

        const panel = document.getElementById('panelEditView');
        const calendarEl = document.getElementById('calendar'); // 변수명 수정

        // 패널 내부 클릭이면 무시
        if (panel && panel.contains(e.target)) return;

        // 캘린더 내부 클릭이면 무시 (드래그, 리사이즈 등)
        if (calendarEl && calendarEl.contains(e.target)) return; // 변수명 수정

        // 외부 클릭 시 패널 닫기
        closeSidePanel();
    });
}


// 패널 뷰 전환 함수
function showEditView() {
    document.getElementById('panelDefaultView').style.display = 'none';
    document.getElementById('panelEditView').style.display = 'flex';
    // --- 수정: 모바일 대응 - 우측 패널에 active 클래스 추가 ---
    document.querySelector('.side-panel')?.classList.add('active');
    document.querySelector('.side-panel')?.classList.add('editing'); // 편집 중 클래스 추가
}

function showDefaultView() {
    document.getElementById('panelDefaultView').style.display = 'flex';
    document.getElementById('panelEditView').style.display = 'none';
     // --- 수정: 모바일 대응 - 우측 패널에 active 클래스 제거 ---
    document.querySelector('.side-panel')?.classList.remove('active');
    document.querySelector('.side-panel')?.classList.remove('editing'); // 편집 중 클래스 제거
}

async function loadEventToForm(eventId) {
    // allEvents 배열에서 이벤트 찾기 (문자열 ID 비교 주의)
    const event = allEvents.find(e => String(e.id) == String(eventId));
    if (!event) {
        console.error(`Event with ID ${eventId} not found in local cache.`);
        // 필요시 API 호출로 이벤트 정보 다시 로드
        return;
    }


    document.getElementById('eventId').value = event.id;
    document.getElementById('eventTitle').value = event.title;
    document.getElementById('eventCategory').value = event.extendedProps.category_id;
    document.getElementById('eventDescription').value = event.extendedProps.description || '';
    document.getElementById('eventAllDay').checked = event.allDay;

    // 반복 일정
    document.getElementById('eventRecurrence').value = event.extendedProps.recurrence_type || '';
    if (event.extendedProps.recurrence_type) {
        document.getElementById('recurrenceOptions').style.display = 'block';
        if (event.extendedProps.recurrence_end_date) {
            document.getElementById('eventRecurrenceEndDate').value = event.extendedProps.recurrence_end_date;
        } else {
            document.getElementById('eventRecurrenceEndDate').value = ''; // 종료일 없으면 비우기
        }
    } else {
         document.getElementById('recurrenceOptions').style.display = 'none'; // 반복 없으면 숨기기
         document.getElementById('eventRecurrenceEndDate').value = ''; // 종료일 비우기
    }

    // 날짜 파싱
    const startDate = event.start.split('T')[0];
    document.getElementById('eventStartDate').value = startDate;

    let endDate = '';
    if (event.end) {
        endDate = event.end.split('T')[0];
        // FullCalendar는 종일 이벤트의 end를 다음날로 설정하므로 조정
        if (event.allDay) {
            const endDateObj = new Date(endDate + 'T00:00:00'); // 시간 정보 추가
            endDateObj.setDate(endDateObj.getDate() - 1);
            endDate = formatDate(endDateObj);
        }
    }
    document.getElementById('eventEndDate').value = endDate;


    // 시간
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');

    if (!event.allDay && event.start.includes('T')) {
        const startTime = event.start.split('T')[1].substring(0, 5);
        startTimeInput.value = startTime;
        startTimeInput.style.display = 'block';

        let endTime = '';
        if (event.end && event.end.includes('T')) {
            endTime = event.end.split('T')[1].substring(0, 5);
        }
        endTimeInput.value = endTime;
        endTimeInput.style.display = 'block'; // 시간 이벤트면 항상 표시 (값이 없더라도)

    } else {
        startTimeInput.value = ''; // 종일이면 시간 비우기
        endTimeInput.value = ''; // 종일이면 시간 비우기
        startTimeInput.style.display = 'none';
        endTimeInput.style.display = 'none';
    }
}


async function saveEvent() {
    const eventId = selectedEventId;
    const title = document.getElementById('eventTitle').value.trim();
    const categoryId = document.getElementById('eventCategory').value;
    const description = document.getElementById('eventDescription').value.trim();
    const allDay = document.getElementById('eventAllDay').checked;
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const recurrenceType = document.getElementById('eventRecurrence').value || null;
    const recurrenceEndDate = document.getElementById('eventRecurrenceEndDate').value || null;

    if (!title || !categoryId || !startDate) {
        showNotification('필수 항목(제목, 카테고리, 시작 날짜)을 입력해주세요.');
        return;
    }

    const eventData = {
        title: title,
        category_id: parseInt(categoryId),
        description: description,
        start_date: startDate,
        end_date: endDate || null,
        all_day: allDay,
        start_time: allDay ? null : (startTime || null), // 시간이 비어있으면 null
        end_time: allDay ? null : (endTime || null), // 시간이 비어있으면 null
        recurrence_type: recurrenceType,
        recurrence_end_date: recurrenceEndDate
    };

    // 데이터 유효성 검사 (예: 종료 시간이 시작 시간보다 빠른 경우)
    if (!allDay && startTime && endTime && eventData.end_date === eventData.start_date) {
        if (endTime <= startTime) {
            showNotification('종료 시간은 시작 시간보다 이후여야 합니다.');
            return;
        }
    }
     if (eventData.end_date && eventData.end_date < eventData.start_date) {
        showNotification('종료 날짜는 시작 날짜보다 이후여야 합니다.');
        return;
     }

    try {
        let response;
        if (eventId) {
            response = await fetch(`/api/calendar/events/${eventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        } else {
            response = await fetch('/api/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        }

        const data = await response.json();

        if (data.status === 'success') {
            // 임시 이벤트 제거
            if (editingTempEvent) {
                const idx = allEvents.findIndex(e => e.id === editingTempEvent.id);
                if (idx !== -1) {
                    allEvents.splice(idx, 1);
                }
                editingTempEvent = null;
            }

            showNotification(eventId ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.');
            closeSidePanel();
            refreshEvents(); // 이벤트 목록 새로고침
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('일정 저장 실패:', error);
        showNotification('일정 저장 중 오류가 발생했습니다.');
    }
}


async function deleteEvent(eventId) {
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('일정이 삭제되었습니다.');
            closeSidePanel();
            refreshEvents(); // 이벤트 목록 새로고침
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        showNotification('일정 삭제 중 오류가 발생했습니다.');
    }
}

async function updateEventDate(eventId, start, end) { // isAllDay 파라미터 제거
    const eventData = {};

    // allEvents에서 이벤트 찾아서 allDay 정보 가져오기
    const event = allEvents.find(e => String(e.id) == String(eventId));
    if (!event) {
        console.error(`Event ${eventId} not found for date update.`);
        return; // 이벤트 없으면 중단
    }
    const isAllDay = event.allDay; // 로컬 캐시의 allDay 정보 사용

    if (isAllDay) {
        // 종일 이벤트
        eventData.start_date = formatDate(start);
        // FullCalendar는 종일 이벤트의 end를 exclusive로 처리 (다음날 00:00)
        if (end) {
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() - 1);
            // 시작 날짜와 같거나 이후인지 확인
            if (endDate >= start) {
                 eventData.end_date = formatDate(endDate);
            } else {
                 eventData.end_date = formatDate(start); // 같게 설정
            }
        } else {
            eventData.end_date = null; // 종료일 없으면 null
        }
        eventData.start_time = null;
        eventData.end_time = null;
        eventData.all_day = true;
    } else {
        // 시간 이벤트
        const startDateTime = new Date(start);
        eventData.start_date = formatDate(startDateTime);
        eventData.start_time = formatTime(startDateTime);

        if (end) {
            const endDateTime = new Date(end);
            // 종료 날짜/시간이 시작 날짜/시간보다 이후인지 확인
            if (endDateTime > startDateTime) {
                eventData.end_date = formatDate(endDateTime);
                eventData.end_time = formatTime(endDateTime);
            } else {
                // 유효하지 않으면 API에서 처리하도록 보내거나, 여기서 기본값 설정
                eventData.end_date = eventData.start_date; // 같은 날짜로
                // eventData.end_time = eventData.start_time; // 같은 시간으로 (혹은 약간 뒤로?)
                 // 예: 시작 시간 + 1시간
                 const defaultEndTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
                 eventData.end_time = formatTime(defaultEndTime);
            }
        } else {
            eventData.end_date = null;
            eventData.end_time = null;
        }
        eventData.all_day = false;
    }


    try {
        // --- PUT 요청 전에 eventId 타입 확인 및 변환 ---
        const eventIdInt = parseInt(eventId, 10);
        if (isNaN(eventIdInt)) {
             console.error("Invalid event ID for update:", eventId);
             // 임시 이벤트 ID (temp-...)인 경우 등 처리
             if (typeof eventId === 'string' && eventId.startsWith('temp-')) {
                 console.log("Skipping API call for temporary event.");
                 // 로컬 데이터만 업데이트 (이미 드래그/리사이즈 핸들러에서 처리됨)
                 const tempEventIndex = allEvents.findIndex(e => e.id === eventId);
                 if (tempEventIndex !== -1) {
                    allEvents[tempEventIndex].start = start.toISOString ? start.toISOString() : formatDate(start);
                    allEvents[tempEventIndex].end = end ? (end.toISOString ? end.toISOString() : formatDate(end)) : null;
                    calendar.refetchEvents();
                 }
                 return;
             }
             throw new Error("Invalid Event ID");
        }
        // --- --- ---

        const response = await fetch(`/api/calendar/events/${eventIdInt}`, { // eventIdInt 사용
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData) // title 등 다른 필드는 보내지 않음
        });


        const data = await response.json();

        if (data.status === 'success') {
            refreshEvents(); // 이벤트 목록 새로고침
            // showNotification('일정이 수정되었습니다.'); // 너무 자주 뜨므로 주석 처리
        } else {
            showNotification('오류: ' + data.message);
            calendar.refetchEvents(); // 실패 시 원래대로 돌리기 위해 refetch
        }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
        showNotification('일정 업데이트 중 오류가 발생했습니다.');
        calendar.refetchEvents(); // 실패 시 원래대로 돌리기 위해 refetch
    }
}


// ==================== 카테고리 모달 ====================
function openCategoryModal() {
    document.getElementById('categoryModalOverlay').classList.add('active');
    document.getElementById('categoryName').focus();
}

function closeCategoryModal() {
    document.getElementById('categoryModalOverlay').classList.remove('active');
    document.getElementById('categoryForm').reset();
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
    // 기본 색상(파란색) 다시 활성화
    const defaultColorOption = document.querySelector('.color-option[data-color="#1976D2"]');
    if (defaultColorOption) {
        defaultColorOption.classList.add('active');
    }
    document.getElementById('categoryColor').value = '#1976D2';
}


async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const color = document.getElementById('categoryColor').value;

    if (!name) {
        showNotification('카테고리 이름을 입력해주세요.');
        return;
    }

    try {
        const response = await fetch('/api/calendar/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, color: color })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('카테고리가 추가되었습니다.');
            closeCategoryModal();
            loadCategories(); // 카테고리 목록 새로고침
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('카테고리 저장 실패:', error);
        showNotification('카테고리 저장 중 오류가 발생했습니다.');
    }
}

async function deleteCategory(categoryId) {
    if (!confirm('이 카테고리를 삭제하시겠습니까?\n카테고리에 속한 모든 일정도 함께 삭제됩니다.')) {
        return;
    }

    try {
        const response = await fetch(`/api/calendar/categories/${categoryId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('카테고리가 삭제되었습니다.');
            loadCategories(); // 카테고리 목록 새로고침
            refreshEvents(); // 이벤트 목록 새로고침 (삭제된 카테고리 이벤트 제거)
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('카테고리 삭제 실패:', error);
        showNotification('카테고리 삭제 중 오류가 발생했습니다.');
    }
}

// ==================== 유틸리티 함수 ====================
function formatDate(date) {
    // Date 객체가 아닌 경우 처리
    if (!(date instanceof Date) || isNaN(date)) {
        try {
            // ISO 문자열 등 파싱 시도
            date = new Date(date);
            if (isNaN(date)) return 'Invalid Date';
        } catch (e) {
            return 'Invalid Date';
        }
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


function updateMainTitle(title) {
    document.getElementById('calendarMainTitle').textContent = title;
}

function refreshEvents() {
    // 현재 뷰의 날짜 범위를 다시 로드
    const view = calendar.view;
    if (view && view.activeStart && view.activeEnd) {
        loadEventsInRange(view.activeStart, view.activeEnd);
    } else {
        // fallback: 오늘 날짜 기준으로 로드
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        loadEventsInRange(startOfMonth, endOfMonth);
    }
}


function showNotification(message) {
    // 임시 알림 (추후 더 나은 UI로 교체 가능)
    const notificationDiv = document.createElement('div');
    notificationDiv.style.position = 'fixed';
    notificationDiv.style.bottom = '20px';
    notificationDiv.style.left = '50%';
    notificationDiv.style.transform = 'translateX(-50%)';
    notificationDiv.style.background = 'rgba(0, 0, 0, 0.7)';
    notificationDiv.style.color = 'white';
    notificationDiv.style.padding = '10px 20px';
    notificationDiv.style.borderRadius = '5px';
    notificationDiv.style.zIndex = '2000'; // z-index 증가
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);

    setTimeout(() => {
        notificationDiv.remove();
    }, 3000);
}


function showEventPreview(event) {
    // 시스템 이벤트 미리보기
    const desc = event.extendedProps.description || '설명 없음';
    alert(`${event.title}\n\n${desc}`);
}

function formatTime(date) {
    // Date 객체가 아닌 경우 처리
    if (!(date instanceof Date) || isNaN(date)) {
        try {
            date = new Date(date);
            if (isNaN(date)) return '00:00';
        } catch (e) {
            return '00:00';
        }
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}


// 특정 날짜가 속한 주 범위 계산 (일요일 시작 ~ 토요일 끝)
function getWeekRangeForDate(date) {
    if (!date || isNaN(new Date(date))) return null;

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0); // 시간 정보 초기화
    const dayOfWeek = targetDate.getDay(); // 0:일요일, 6:토요일

    const weekStart = new Date(targetDate);
    weekStart.setDate(targetDate.getDate() - dayOfWeek);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999); // 종료일은 포함되도록 시간 설정

    return { start: weekStart, end: weekEnd };
}


// 현재 주 범위 계산 (메인 캘린더 기준 - 사용하지 않음, getWeekRangeForDate로 대체 가능)
/*
function getCurrentWeekRange() {
    // ... (이 함수는 getWeekRangeForDate(new Date()) 로 대체 가능하여 주석 처리)
}
*/

// ==================== 드래그로 일정 생성 (NEW) ====================
function createEventByDrag(start, end, allDay) {
    // 최소 1시간 보장 (시간 뷰에서)
    if (!allDay) {
        const duration = (end - start) / (1000 * 60); // minutes
        if (duration < 60) {
            end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour
        }
    }

    // 임시 이벤트 생성
    const tempEvent = createTempEvent(start, end, allDay);

    // 편집 상태 설정
    editingTempEvent = tempEvent;

    // 패널 즉시 열기
    openSidePanelForEdit(tempEvent);
}

function createTempEvent(start, end, allDay) {
    const tempId = 'temp-' + Date.now();
    const defaultCategory = categories.find(c => !c.is_system);

    const tempEvent = {
        id: tempId,
        title: '제목 없음', // 기본 제목
        start: allDay ? formatDate(start) : start.toISOString(),
        // 종일 이벤트 종료일 처리: FullCalendar는 exclusive end date 사용
        end: allDay ? (end ? formatDate(new Date(end.getTime())) : null) : (end ? end.toISOString() : null),
        allDay: allDay,
        backgroundColor: defaultCategory?.color || '#2383e2',
        borderColor: defaultCategory?.color || '#2383e2',
        extendedProps: {
            category_id: defaultCategory?.id,
            description: '',
            is_temp: true // 임시 이벤트 플래그
        }
    };


    // 캘린더에 추가
    allEvents.push(tempEvent);
    calendar.refetchEvents();

    return tempEvent;
}

function openSidePanelForEdit(tempEvent) {
    const form = document.getElementById('eventForm');

    // 폼 리셋
    form.reset();
    selectedEventId = null; // 새 일정이므로 ID 없음

    // 임시 이벤트 데이터로 폼 채우기
    document.getElementById('eventTitle').value = ''; // 제목은 비워둠
    document.getElementById('eventCategory').value = tempEvent.extendedProps.category_id;
    document.getElementById('eventAllDay').checked = tempEvent.allDay;

    const startDate = tempEvent.start.split('T')[0];
    document.getElementById('eventStartDate').value = startDate;

    let endDate = '';
    if (tempEvent.end) {
        endDate = tempEvent.end.split('T')[0];
        // FullCalendar 종일 이벤트 end date 조정
        if (tempEvent.allDay) {
             const endDateObj = new Date(endDate + 'T00:00:00');
             endDateObj.setDate(endDateObj.getDate() - 1);
             endDate = formatDate(endDateObj);
        }
    }
    document.getElementById('eventEndDate').value = endDate;


    // 시간 필드 처리
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');
    if (!tempEvent.allDay) {
        startTimeInput.value = formatTime(new Date(tempEvent.start));
        endTimeInput.value = tempEvent.end ? formatTime(new Date(tempEvent.end)) : '';
        startTimeInput.style.display = 'block';
        endTimeInput.style.display = 'block';
    } else {
        startTimeInput.value = '';
        endTimeInput.value = '';
        startTimeInput.style.display = 'none';
        endTimeInput.style.display = 'none';
    }

     // 반복 일정 초기화
     document.getElementById('eventRecurrence').value = '';
     document.getElementById('recurrenceOptions').style.display = 'none';
     document.getElementById('eventRecurrenceEndDate').value = '';

    // 삭제 버튼 숨김 (신규 생성이므로)
    document.getElementById('deleteEventBtn').style.display = 'none';

    // 패널 뷰 전환 (기본 → 편집)
    showEditView();

    // 제목 입력에 포커스
    setTimeout(() => {
        const titleInput = document.getElementById('eventTitle');
        titleInput.focus();
        // titleInput.select(); // '제목 없음'을 미리 선택하지 않도록 주석 처리
    }, 100);
}


// ==================== 실시간 양방향 바인딩 (NEW) ====================
function setupRealtimeBinding() {
    const titleInput = document.getElementById('eventTitle');
    const categorySelect = document.getElementById('eventCategory');
    const startDateInput = document.getElementById('eventStartDate');
    const endDateInput = document.getElementById('eventEndDate'); // 종료 날짜 추가
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');
    const allDayCheckbox = document.getElementById('eventAllDay'); // 종일 체크박스 추가

    // 제목 실시간 업데이트
    titleInput.addEventListener('input', function() {
        if (editingTempEvent) {
            const event = calendar.getEventById(editingTempEvent.id);
            if (event) {
                event.setProp('title', this.value || '제목 없음');
            }
        }
    });

    // 카테고리 변경 시 색상 업데이트
    categorySelect.addEventListener('change', function() {
        if (editingTempEvent) {
            const category = categories.find(c => c.id == this.value);
            const event = calendar.getEventById(editingTempEvent.id);
            if (event && category) {
                event.setProp('backgroundColor', category.color);
                event.setProp('borderColor', category.color);
                event.setExtendedProp('category_id', parseInt(category.id, 10)); // extendedProps 업데이트
            }
        }
    });

    // 날짜/시간 변경 시 위치 업데이트
    [startDateInput, endDateInput, startTimeInput, endTimeInput, allDayCheckbox].forEach(input => {
        input.addEventListener('change', function() {
            if (editingTempEvent) {
                updateTempEventFromForm();
            }
        });
    });
}


function updateTempEventFromForm() {
    if (!editingTempEvent) return;

    const event = calendar.getEventById(editingTempEvent.id);
    if (!event) return;

    const startDate = document.getElementById('eventStartDate').value;
    let endDate = document.getElementById('eventEndDate').value; // 종료 날짜
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const isAllDay = document.getElementById('eventAllDay').checked;

    if (isAllDay) {
        event.setAllDay(true);
        event.setStart(startDate);
        // FullCalendar 종일 이벤트 end date 처리 (exclusive)
        if (endDate) {
             const endDateObj = new Date(endDate + 'T00:00:00');
             endDateObj.setDate(endDateObj.getDate() + 1);
             event.setEnd(formatDate(endDateObj));
        } else {
             event.setEnd(null); // 종료일 없으면 null
        }
    } else {
        event.setAllDay(false);
        const newStartStr = startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`; // 시간 없으면 00:00
        const newEndStr = endTime ? `${endDate || startDate}T${endTime}:00` : null; // 종료 시간 없으면 null

        // 시작/종료 유효성 간단 체크
        const newStart = new Date(newStartStr);
        let newEnd = newEndStr ? new Date(newEndStr) : null;

        if (newEnd && newEnd <= newStart) {
            // 종료가 시작보다 빠르면 임의로 1시간 뒤로 설정 (혹은 오류 처리)
            newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
            // 폼에도 반영 (선택적)
            // document.getElementById('eventEndDate').value = formatDate(newEnd);
            // document.getElementById('eventEndTime').value = formatTime(newEnd);
        }

        event.setStart(newStart);
        event.setEnd(newEnd);
    }

}


function updateFormFromTempEvent(event) {
    // 캘린더에서 드래그/리사이즈 시 폼 업데이트
    const startDate = event.start;
    const endDate = event.end;
    const isAllDay = event.allDay;

    document.getElementById('eventStartDate').value = formatDate(startDate);
    document.getElementById('eventAllDay').checked = isAllDay;

    let formEndDate = '';
    if (endDate) {
         formEndDate = formatDate(endDate);
         // FullCalendar 종일 이벤트 end date 조정
         if (isAllDay) {
             const endDateObj = new Date(formEndDate + 'T00:00:00');
             endDateObj.setDate(endDateObj.getDate() - 1);
             formEndDate = formatDate(endDateObj);
         }
    }
    document.getElementById('eventEndDate').value = formEndDate;


    // 시간 필드 업데이트 및 표시/숨김
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');
    if (!isAllDay) {
        startTimeInput.value = formatTime(startDate);
        endTimeInput.value = endDate ? formatTime(endDate) : '';
        startTimeInput.style.display = 'block';
        endTimeInput.style.display = 'block';
    } else {
        startTimeInput.value = '';
        endTimeInput.value = '';
        startTimeInput.style.display = 'none';
        endTimeInput.style.display = 'none';
    }
}