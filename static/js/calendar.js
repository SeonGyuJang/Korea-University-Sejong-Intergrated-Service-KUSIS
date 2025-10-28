// ==================== 노션 스타일 캘린더 JavaScript ====================

// 전역 변수
let calendar;
let categories = [];
let allEvents = [];
let visibleCategories = new Set();
let currentMiniCalendarDate = new Date();
let selectedEventId = null;
let selectedMiniCalendarDate = null;

let editingTempEvent = null;

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeCalendar();
    loadCategories();
    const today = new Date();
    today.setHours(0,0,0,0);
    selectedMiniCalendarDate = new Date(today);
    renderMiniCalendar();
    setupEventListeners();
    setupKeyboardShortcuts(); // 키보드 단축키 리스너 등록
    setupOutsideClickClose();
});

// ==================== FullCalendar 초기화 ====================
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.error("Calendar element '#calendar' not found.");
        return;
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        locale: 'ko',
        headerToolbar: false, // 커스텀 툴바 사용
        editable: true,
        selectable: true,
        selectMirror: true,
        dayMaxEvents: 3,
        weekends: true,
        // --- 수정: height와 contentHeight 제거하여 FullCalendar가 부모(.main-calendar) 높이에 맞춰지도록 ---
        // height: 'auto',
        // contentHeight: 'auto',
        nowIndicator: true,
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
        selectMinDistance: 5,

        select: function(info) {
            createEventByDrag(info.start, info.end, info.allDay);
            calendar.unselect();
        },

        dateClick: function(info) {
            if (calendar.view.type === 'dayGridMonth') {
                showQuickEventModal(info.dateStr);
            }
        },

        eventClick: function(info) {
            info.jsEvent.preventDefault();
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            if (isTemp) return;

            if (isSystem) {
                showEventPreview(info.event);
            } else {
                openSidePanel(eventId);
            }
        },

        eventDrop: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 이동할 수 없습니다.');
                return;
            }

            if (isTemp) {
                updateFormFromTempEvent(info.event);
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        eventResize: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 수정할 수 없습니다.');
                return;
            }

            if (isTemp) {
                updateFormFromTempEvent(info.event);
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        datesSet: function(info) {
            updateMainTitle(info.view.title);
            loadEventsInRange(info.start, info.end);
            const newDate = calendar.getDate();
            selectedMiniCalendarDate = new Date(newDate);
            selectedMiniCalendarDate.setHours(0,0,0,0);
            renderMiniCalendar();
        },

        events: function(info, successCallback, failureCallback) {
            const filteredEvents = allEvents.filter(event =>
                visibleCategories.has(event.extendedProps.category_id)
            );
            successCallback(filteredEvents);
        },

        eventDidMount: function(info) {
            const event = info.event;
            const el = info.el;

            if (event.backgroundColor) {
                el.style.backgroundColor = event.backgroundColor;
                el.style.borderColor = event.borderColor || event.backgroundColor;
                el.style.opacity = '1';
            }

            if (event.extendedProps.is_system) {
                el.style.fontWeight = '600';
                el.style.cursor = 'pointer';
            }
        },
         // --- 추가: 창 크기 변경 시 캘린더 크기 자동 조절 ---
         windowResize: function(view) {
             // FullCalendar가 자동으로 크기를 조절하므로 특별한 로직 불필요
             // console.log("Window resized, calendar size updated.");
         }
    });

    calendar.render();
}

// ==================== 미니 캘린더 ====================
function renderMiniCalendar() {
    const miniCalendar = document.getElementById('miniCalendar');
    if (!miniCalendar) return; // 요소 없으면 종료
    const year = currentMiniCalendarDate.getFullYear();
    const month = currentMiniCalendarDate.getMonth();
    const today = new Date();
    today.setHours(0,0,0,0);

    const titleEl = document.getElementById('miniCalendarTitle');
    if(titleEl) titleEl.textContent = `${year}년 ${month + 1}월`;

    const dateToHighlight = selectedMiniCalendarDate;
    const weekRangeToHighlight = dateToHighlight ? getWeekRangeForDate(dateToHighlight) : null;

    const firstDayOfMonth = new Date(year, month, 1);
    const firstDayWeekday = firstDayOfMonth.getDay();
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    const lastDateOfPrevMonth = new Date(year, month, 0).getDate();

    let html = '<div class="mini-calendar-grid">';

    ['일', '월', '화', '수', '목', '금', '토'].forEach(day => {
        html += `<div class="mini-calendar-weekday">${day}</div>`;
    });

    for (let i = firstDayWeekday - 1; i >= 0; i--) {
        html += `<div class="mini-calendar-day other-month">${lastDateOfPrevMonth - i}</div>`;
    }

    for (let day = 1; day <= lastDateOfMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isToday = date.toDateString() === today.toDateString();

        const hasEvents = allEvents.some(e => {
            if (!visibleCategories.has(e.extendedProps.category_id)) return false;
            const eventStart = e.start.split('T')[0];
            const eventEnd = e.end ? e.end.split('T')[0] : null;
            if (eventStart === dateStr) return true;
            if (eventEnd) {
                 // FullCalendar 종일 end date 보정
                 let adjustedEnd = eventEnd;
                 if(e.allDay){
                      const endDateObj = new Date(eventEnd + 'T00:00:00');
                      endDateObj.setDate(endDateObj.getDate() - 1);
                      adjustedEnd = formatDate(endDateObj);
                 }
                 if (eventStart <= dateStr && dateStr <= adjustedEnd) return true;
            }
            return false;
        });


        const isClicked = selectedMiniCalendarDate &&
            formatDate(selectedMiniCalendarDate) === dateStr;

        let classes = 'mini-calendar-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';
        if (isClicked) classes += ' clicked-date';

        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    const totalCells = firstDayWeekday + lastDateOfMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
        html += `<div class="mini-calendar-day other-month">${day}</div>`;
    }

    const highlightInfo = calculateHighlightInfo(weekRangeToHighlight, year, month, firstDayWeekday);

    if (highlightInfo) {
        html += `<div class="week-highlight" style="grid-row: ${highlightInfo.row}; grid-column: ${highlightInfo.colStart} / ${highlightInfo.colEnd};"></div>`;
    }

    html += '</div>';
    miniCalendar.innerHTML = html;

    miniCalendar.querySelectorAll('.mini-calendar-day:not(.other-month)').forEach(dayEl => {
        dayEl.addEventListener('click', function() {
            const dateStr = this.dataset.date;
            selectedMiniCalendarDate = new Date(dateStr + 'T00:00:00');
            selectedMiniCalendarDate.setHours(0,0,0,0);
            if(calendar) calendar.gotoDate(dateStr); // calendar 객체 확인
            renderMiniCalendar();
        });
    });
}

function calculateHighlightInfo(weekRange, currentYear, currentMonth, firstDayWeekday) {
    if (!weekRange) return null;
    const weekStart = weekRange.start;
    const weekEnd = weekRange.end;
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    if (weekEnd >= monthStart && weekStart <= monthEnd) {
        let firstDayInMonth = null;
        let lastDayInMonth = null;
        for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                if (!firstDayInMonth) firstDayInMonth = new Date(d);
                lastDayInMonth = new Date(d);
            }
        }
        if (firstDayInMonth && lastDayInMonth) {
            const startDay = firstDayInMonth.getDate();
            const startCellIndex = firstDayWeekday + startDay - 1;
            const startRow = Math.floor(startCellIndex / 7);
            const effectiveStartDayOfWeek = (weekStart < monthStart) ? 0 : weekStart.getDay();
            const effectiveEndDayOfWeek = (weekEnd > monthEnd) ? 6 : weekEnd.getDay();
            return {
                row: startRow + 2,
                colStart: effectiveStartDayOfWeek + 1,
                colEnd: effectiveEndDayOfWeek + 2
            };
        }
    }
    return null;
}


// ==================== 이벤트 리스너 설정 ====================
function setupEventListeners() {
    // 미니 캘린더 네비게이션
    const miniPrev = document.getElementById('miniPrevMonth');
    const miniNext = document.getElementById('miniNextMonth');
    const todayBtn = document.getElementById('todayBtn');

    if(miniPrev) miniPrev.addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() - 1);
        renderMiniCalendar();
    });
    if(miniNext) miniNext.addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() + 1);
        renderMiniCalendar();
    });
    if(todayBtn) todayBtn.addEventListener('click', function() {
        const today = new Date();
        today.setHours(0,0,0,0);
        currentMiniCalendarDate = new Date(today);
        selectedMiniCalendarDate = new Date(today);
        if(calendar) calendar.today(); // calendar 객체 확인
        renderMiniCalendar();
    });

    // 뷰 전환
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            if(calendar) calendar.changeView(view); // calendar 객체 확인
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // 카테고리 추가 버튼
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if(addCategoryBtn) addCategoryBtn.addEventListener('click', openCategoryModal);

    // 사이드 패널 닫기
    const closePanelBtn = document.getElementById('closePanelBtn');
    const cancelEventBtn = document.getElementById('cancelEventBtn');
    if(closePanelBtn) closePanelBtn.addEventListener('click', closeSidePanel);
    if(cancelEventBtn) cancelEventBtn.addEventListener('click', closeSidePanel);

    // 일정 폼 제출
    const eventForm = document.getElementById('eventForm');
    if(eventForm) eventForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveEvent();
    });

    // 일정 삭제
    const deleteEventBtn = document.getElementById('deleteEventBtn');
    if(deleteEventBtn) deleteEventBtn.addEventListener('click', function() {
        if (confirm('이 일정을 삭제하시겠습니까?')) {
            deleteEvent(selectedEventId);
        }
    });

    // 종일 체크박스
    const eventAllDay = document.getElementById('eventAllDay');
    if(eventAllDay) eventAllDay.addEventListener('change', function() {
        const isAllDay = this.checked;
        const startTimeInput = document.getElementById('eventStartTime');
        const endTimeInput = document.getElementById('eventEndTime');
        if(startTimeInput) startTimeInput.style.display = isAllDay ? 'none' : 'block';
        if(endTimeInput) endTimeInput.style.display = isAllDay ? 'none' : 'block';
        if (editingTempEvent) {
            updateTempEventFromForm();
        }
    });

    setupRealtimeBinding();

    // 반복 일정 선택
    const eventRecurrence = document.getElementById('eventRecurrence');
    if(eventRecurrence) eventRecurrence.addEventListener('change', function() {
        const hasRecurrence = this.value !== '';
        const recurrenceOptions = document.getElementById('recurrenceOptions');
        if(recurrenceOptions) recurrenceOptions.style.display = hasRecurrence ? 'block' : 'none';
    });

    // 빠른 추가 모달
    const closeQuickModalBtn = document.getElementById('closeQuickModalBtn');
    const quickEventForm = document.getElementById('quickEventForm');
    const quickDetailBtn = document.getElementById('quickDetailBtn');
    if(closeQuickModalBtn) closeQuickModalBtn.addEventListener('click', closeQuickEventModal);
    if(quickEventForm) quickEventForm.addEventListener('submit', function(e) {
        e.preventDefault();
        quickAddEvent();
    });
    if(quickDetailBtn) quickDetailBtn.addEventListener('click', function() {
        const dateStr = document.getElementById('quickEventDate').value;
        const title = document.getElementById('quickEventTitle').value;
        const categoryId = document.getElementById('quickEventCategory').value;
        closeQuickEventModal();
        openSidePanel(null, dateStr, title, categoryId);
    });

    // 카테고리 모달
    const closeCategoryModalBtn = document.getElementById('closeCategoryModalBtn');
    const cancelCategoryBtn = document.getElementById('cancelCategoryBtn');
    const categoryForm = document.getElementById('categoryForm');
    if(closeCategoryModalBtn) closeCategoryModalBtn.addEventListener('click', closeCategoryModal);
    if(cancelCategoryBtn) cancelCategoryBtn.addEventListener('click', closeCategoryModal);
    if(categoryForm) categoryForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveCategory();
    });

    // 색상 선택
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            const categoryColor = document.getElementById('categoryColor');
            if(categoryColor) categoryColor.value = this.dataset.color;
        });
    });

    // 모달 오버레이 클릭 시 닫기
    const categoryModalOverlay = document.getElementById('categoryModalOverlay');
    const quickEventModal = document.getElementById('quickEventModal');
    if(categoryModalOverlay) categoryModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) closeCategoryModal();
    });
    if(quickEventModal) quickEventModal.addEventListener('click', function(e) {
        if (e.target === this) closeQuickEventModal();
    });

    // --- 추가: 툴바의 사이드바 토글 버튼 ---
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }
    // --- 추가 끝 ---
}

// ==================== 키보드 단축키 ====================
function setupKeyboardShortcuts() {
    const handleKeyDown = function(e) {
        const isInputFocused = document.activeElement && (
            document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.tagName === 'SELECT' ||
            document.activeElement.isContentEditable
        );

        if (e.key === 'Escape') {
            const panelEditView = document.getElementById('panelEditView');
            const quickEventModal = document.getElementById('quickEventModal');
            const categoryModalOverlay = document.getElementById('categoryModalOverlay');
            if (panelEditView && panelEditView.style.display !== 'none') closeSidePanel();
            else if (quickEventModal && quickEventModal.classList.contains('active')) closeQuickEventModal();
            else if (categoryModalOverlay && categoryModalOverlay.classList.contains('active')) closeCategoryModal();
            return;
        }

        // --- 수정: Backslash 키 로직 (e.code 사용) ---
        // Check for the physical key location 'Backslash' which corresponds to '\' or '₩'
        if (e.code === 'Backslash') {
            e.preventDefault(); // Prevent typing the character
            toggleSidebar(); // Call the sidebar toggle function
            return; // Stop further processing for this key press
        }
        // --- 수정 끝 ---

        if (isInputFocused) return;

        switch (e.code) {
            case 'KeyN':
                e.preventDefault();
                const todayForN = formatDate(new Date());
                showQuickEventModal(todayForN);
                break;
            case 'KeyT':
                e.preventDefault();
                const todayForT = new Date();
                todayForT.setHours(0,0,0,0);
                currentMiniCalendarDate = new Date(todayForT);
                selectedMiniCalendarDate = new Date(todayForT);
                if(calendar) calendar.today();
                renderMiniCalendar();
                showNotification('오늘로 이동했습니다.');
                break;
            case 'KeyW':
                e.preventDefault();
                if(calendar) calendar.changeView('timeGridWeek');
                updateViewButtons('timeGridWeek');
                break;
            case 'KeyM':
                e.preventDefault();
                if(calendar) calendar.changeView('dayGridMonth');
                updateViewButtons('dayGridMonth');
                break;
            case 'KeyD':
                e.preventDefault();
                if(calendar) calendar.changeView('timeGridDay');
                updateViewButtons('timeGridDay');
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if(calendar) calendar.prev();
                break;
            case 'ArrowRight':
                e.preventDefault();
                if(calendar) calendar.next();
                break;
        }
    };

    // 기존 리스너 제거 후 새로 등록
    document.removeEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleKeyDown);
}

// 뷰 버튼 UI 업데이트
function updateViewButtons(viewType) {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewType);
    });
}

// --- 사이드바 토글 함수 (수정) ---
function toggleSidebar() {
    const sidebar = document.getElementById('calendarSidebar'); // ID 사용
    const main = document.getElementById('calendarMain'); // ID 사용
    const sidePanel = document.getElementById('sidePanel'); // ID 사용

    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        // 메인 영역과 우측 패널에도 클래스를 토글하여 CSS에서 margin-left 조정
        main?.classList.toggle('sidebar-collapsed');
        sidePanel?.classList.toggle('sidebar-collapsed');

        // FullCalendar 크기 재조정 (애니메이션 시간 후)
        setTimeout(() => {
            if (calendar) {
                calendar.updateSize();
            }
        }, 300); // CSS transition 시간 (0.3s)
    }
}


// ==================== 카테고리 관리 ====================
async function loadCategories() {
    try {
        const response = await fetch('/api/calendar/categories');
        const data = await response.json();
        if (data.status === 'success') {
            categories = data.categories;
            visibleCategories.clear();
            categories.forEach(cat => visibleCategories.add(cat.id));
            renderCategories();
            renderCategorySelect();
        } else {
            console.error('Failed to load categories:', data.message);
        }
    } catch (error) {
        console.error('카테고리 로드 실패:', error);
        showNotification('카테고리를 불러오는 중 오류가 발생했습니다.');
    }
}

function renderCategories() {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;
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
                    <button class="icon-btn delete-btn" data-category-id="${category.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        `;
        // 이벤트 위임 사용: 카테고리 클릭
        item.addEventListener('click', function(e) {
            if (!e.target.closest('.category-actions')) {
                toggleCategoryVisibility(category.id);
            }
        });
        // 이벤트 위임 사용: 삭제 버튼 클릭
        const deleteBtn = item.querySelector('.delete-btn');
        if(deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 부모의 클릭 이벤트 방지
                deleteCategory(category.id);
            });
        }

        categoryList.appendChild(item);
    });
}


function toggleCategoryVisibility(categoryId) {
    if (visibleCategories.has(categoryId)) {
        visibleCategories.delete(categoryId);
    } else {
        visibleCategories.add(categoryId);
    }
    renderCategories(); // UI 업데이트
    if(calendar) calendar.refetchEvents(); // 캘린더 이벤트 필터링
}

function renderCategorySelect() {
    const selects = [
        document.getElementById('eventCategory'),
        document.getElementById('quickEventCategory')
    ];
    selects.forEach(select => {
        if (!select) return;
        const currentVal = select.value; // 현재 선택된 값 저장
        select.innerHTML = ''; // 옵션 비우기
        // 시스템 카테고리 제외하고 옵션 추가
        categories.filter(cat => !cat.is_system).forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
        // 이전에 선택된 값이 있으면 복원
        if(currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
            select.value = currentVal;
        } else if (select.options.length > 0) {
            select.value = select.options[0].value; // 첫 번째 옵션 선택
        }
    });
}

// ==================== 이벤트 관리 ====================
async function loadEventsInRange(start, end) {
    try {
        const startStr = formatDate(new Date(start));
        const endStr = formatDate(new Date(end));
        const response = await fetch(`/api/calendar/events?start=${startStr}&end=${endStr}`);
        const data = await response.json();
        if (data.status === 'success') {
            allEvents = data.events;
            if(calendar) calendar.refetchEvents();
            renderMiniCalendar();
        } else {
             console.error('Failed to load events:', data.message);
        }
    } catch (error) {
        console.error('이벤트 로드 실패:', error);
    }
}


// ==================== 중앙 빠른 추가 모달 ====================
function showQuickEventModal(dateStr) {
    const modal = document.getElementById('quickEventModal');
    if (!modal) return;
    const dateInput = document.getElementById('quickEventDate');
    const titleInput = document.getElementById('quickEventTitle');
    const categorySelect = document.getElementById('quickEventCategory');

    if(dateInput) dateInput.value = dateStr;
    if(titleInput) titleInput.value = '';

    const firstUserCategory = categories.find(cat => !cat.is_system);
    if (firstUserCategory && categorySelect) {
        categorySelect.value = firstUserCategory.id;
    }

    modal.classList.add('active');
    setTimeout(() => titleInput?.focus(), 100);
}

function closeQuickEventModal() {
    const modal = document.getElementById('quickEventModal');
    if(modal) modal.classList.remove('active');
}

async function quickAddEvent() {
    const titleInput = document.getElementById('quickEventTitle');
    const dateInput = document.getElementById('quickEventDate');
    const categorySelect = document.getElementById('quickEventCategory');
    if (!titleInput || !dateInput || !categorySelect) return;

    const title = titleInput.value.trim();
    const dateStr = dateInput.value;
    const categoryId = categorySelect.value;
    if (!title || !categoryId) {
        showNotification('제목과 카테고리를 입력해주세요.'); return;
    }
    const eventData = {
        title: title, category_id: parseInt(categoryId), description: '',
        start_date: dateStr, end_date: null, all_day: true,
        start_time: null, end_time: null,
        recurrence_type: null, recurrence_end_date: null
    };
    try {
        const response = await fetch('/api/calendar/events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        const data = await response.json();
        if (data.status === 'success') {
            closeQuickEventModal(); refreshEvents();
            showNotification('일정이 추가되었습니다.');
        } else { showNotification('오류: ' + data.message); }
    } catch (error) {
        console.error('빠른 추가 실패:', error);
        showNotification('일정 추가 중 오류가 발생했습니다.');
    }
}

// ==================== 사이드 패널 ====================
function openSidePanel(eventId = null, dateStr = null, title = '', categoryId = null) {
    const form = document.getElementById('eventForm');
    const deleteBtn = document.getElementById('deleteEventBtn');
    if (!form || !deleteBtn) return;

    form.reset();
    selectedEventId = eventId;
    const recurrenceSelect = document.getElementById('eventRecurrence');
    const recurrenceOptions = document.getElementById('recurrenceOptions');
    const recurrenceEndDate = document.getElementById('eventRecurrenceEndDate');
    if(recurrenceSelect) recurrenceSelect.value = '';
    if(recurrenceOptions) recurrenceOptions.style.display = 'none';
    if(recurrenceEndDate) recurrenceEndDate.value = '';

    const eventStartDate = document.getElementById('eventStartDate');
    const eventEndDate = document.getElementById('eventEndDate');
    const eventAllDay = document.getElementById('eventAllDay');
    const eventTitle = document.getElementById('eventTitle');
    const eventCategory = document.getElementById('eventCategory');
    const eventStartTime = document.getElementById('eventStartTime');
    const eventEndTime = document.getElementById('eventEndTime');


    if (eventId) {
        loadEventToForm(eventId);
        deleteBtn.style.display = 'flex';
    } else {
        const today = dateStr || formatDate(new Date());
        if(eventStartDate) eventStartDate.value = today;
        if(eventEndDate) eventEndDate.value = '';
        if(eventAllDay) eventAllDay.checked = true;
        if(eventTitle && title) eventTitle.value = title;
        if(eventCategory) {
            if (categoryId) eventCategory.value = categoryId;
            else {
                 const firstUserCategory = categories.find(cat => !cat.is_system);
                 if (firstUserCategory) eventCategory.value = firstUserCategory.id;
            }
        }
        deleteBtn.style.display = 'none';
        if(eventStartTime) eventStartTime.style.display = 'none';
        if(eventEndTime) eventEndTime.style.display = 'none';
    }
    showEditView();
}


function closeSidePanel() {
    if (editingTempEvent && calendar) {
        const tempEv = calendar.getEventById(editingTempEvent.id);
        if (tempEv) tempEv.remove(); // 캘린더에서 임시 이벤트 제거
        // allEvents 배열에서도 제거 (선택적 - refetchEvents로 처리 가능)
        const idx = allEvents.findIndex(e => e.id === editingTempEvent.id);
        if (idx !== -1) allEvents.splice(idx, 1);
        editingTempEvent = null;
    }
    selectedEventId = null;
    showDefaultView();
}


function setupOutsideClickClose() {
    document.addEventListener('click', function(e) {
        const panelEditView = document.getElementById('panelEditView');
        const sidePanel = document.getElementById('sidePanel');
        const calendarEl = document.getElementById('calendar');

        // 편집 중이고 패널이 보이는 상태인지 확인
        if (!editingTempEvent || !panelEditView || panelEditView.style.display === 'none') return;

        // 클릭된 요소가 패널 내부 또는 캘린더 내부가 *아닌* 경우
        if (sidePanel && !sidePanel.contains(e.target) && calendarEl && !calendarEl.contains(e.target)) {
            closeSidePanel();
        }
    });
}


function showEditView() {
    const defaultView = document.getElementById('panelDefaultView');
    const editView = document.getElementById('panelEditView');
    const sidePanel = document.getElementById('sidePanel');
    if(defaultView) defaultView.style.display = 'none';
    if(editView) editView.style.display = 'flex';
    sidePanel?.classList.add('active'); // 모바일 대응
    sidePanel?.classList.add('editing');
}

function showDefaultView() {
    const defaultView = document.getElementById('panelDefaultView');
    const editView = document.getElementById('panelEditView');
    const sidePanel = document.getElementById('sidePanel');
    if(defaultView) defaultView.style.display = 'flex';
    if(editView) editView.style.display = 'none';
    sidePanel?.classList.remove('active'); // 모바일 대응
    sidePanel?.classList.remove('editing');
}

async function loadEventToForm(eventId) {
    const event = allEvents.find(e => String(e.id) == String(eventId));
    if (!event) return;

    const eventIdInput = document.getElementById('eventId');
    const eventTitleInput = document.getElementById('eventTitle');
    const eventCategorySelect = document.getElementById('eventCategory');
    const eventDescription = document.getElementById('eventDescription');
    const eventAllDayCheckbox = document.getElementById('eventAllDay');
    const eventRecurrenceSelect = document.getElementById('eventRecurrence');
    const recurrenceOptionsDiv = document.getElementById('recurrenceOptions');
    const eventRecurrenceEndDateInput = document.getElementById('eventRecurrenceEndDate');
    const eventStartDateInput = document.getElementById('eventStartDate');
    const eventEndDateInput = document.getElementById('eventEndDate');
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');


    if(eventIdInput) eventIdInput.value = event.id;
    if(eventTitleInput) eventTitleInput.value = event.title;
    if(eventCategorySelect) eventCategorySelect.value = event.extendedProps.category_id;
    if(eventDescription) eventDescription.value = event.extendedProps.description || '';
    if(eventAllDayCheckbox) eventAllDayCheckbox.checked = event.allDay;
    if(eventRecurrenceSelect) eventRecurrenceSelect.value = event.extendedProps.recurrence_type || '';

    if (event.extendedProps.recurrence_type) {
        if(recurrenceOptionsDiv) recurrenceOptionsDiv.style.display = 'block';
        if(eventRecurrenceEndDateInput) eventRecurrenceEndDateInput.value = event.extendedProps.recurrence_end_date || '';
    } else {
        if(recurrenceOptionsDiv) recurrenceOptionsDiv.style.display = 'none';
        if(eventRecurrenceEndDateInput) eventRecurrenceEndDateInput.value = '';
    }

    const startDate = event.start.split('T')[0];
    if(eventStartDateInput) eventStartDateInput.value = startDate;
    let endDate = '';
    if (event.end) {
        endDate = event.end.split('T')[0];
        if (event.allDay) {
            const endDateObj = new Date(endDate + 'T00:00:00');
            endDateObj.setDate(endDateObj.getDate() - 1); endDate = formatDate(endDateObj);
        }
    }
    if(eventEndDateInput) eventEndDateInput.value = endDate;

    if (!event.allDay && event.start.includes('T')) {
        const startTime = event.start.split('T')[1].substring(0, 5);
        if(startTimeInput) { startTimeInput.value = startTime; startTimeInput.style.display = 'block'; }
        let endTime = '';
        if (event.end && event.end.includes('T')) {
            endTime = event.end.split('T')[1].substring(0, 5);
        }
        if(endTimeInput) { endTimeInput.value = endTime; endTimeInput.style.display = 'block'; }
    } else {
        if(startTimeInput) { startTimeInput.value = ''; startTimeInput.style.display = 'none'; }
        if(endTimeInput) { endTimeInput.value = ''; endTimeInput.style.display = 'none'; }
    }
}


async function saveEvent() {
    const eventId = selectedEventId;
    const title = document.getElementById('eventTitle')?.value.trim();
    const categoryId = document.getElementById('eventCategory')?.value;
    const description = document.getElementById('eventDescription')?.value.trim();
    const allDay = document.getElementById('eventAllDay')?.checked;
    const startDate = document.getElementById('eventStartDate')?.value;
    const endDate = document.getElementById('eventEndDate')?.value;
    const startTime = document.getElementById('eventStartTime')?.value;
    const endTime = document.getElementById('eventEndTime')?.value;
    const recurrenceType = document.getElementById('eventRecurrence')?.value || null;
    const recurrenceEndDate = document.getElementById('eventRecurrenceEndDate')?.value || null;

    if (!title || !categoryId || !startDate) {
        showNotification('필수 항목(제목, 카테고리, 시작 날짜)을 입력해주세요.'); return;
    }
    const eventData = {
        title: title, category_id: parseInt(categoryId), description: description,
        start_date: startDate, end_date: endDate || null, all_day: allDay,
        start_time: allDay ? null : (startTime || null),
        end_time: allDay ? null : (endTime || null),
        recurrence_type: recurrenceType, recurrence_end_date: recurrenceEndDate
    };
    if (!allDay && startTime && endTime && eventData.end_date === eventData.start_date && endTime <= startTime) {
        showNotification('종료 시간은 시작 시간보다 이후여야 합니다.'); return;
    }
     if (eventData.end_date && eventData.end_date < eventData.start_date) {
        showNotification('종료 날짜는 시작 날짜보다 이후여야 합니다.'); return;
     }
    try {
        let response;
        if (eventId) {
            response = await fetch(`/api/calendar/events/${eventId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        } else {
            response = await fetch('/api/calendar/events', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        }
        const data = await response.json();
        if (data.status === 'success') {
            if (editingTempEvent && calendar) {
                const tempEv = calendar.getEventById(editingTempEvent.id);
                if(tempEv) tempEv.remove();
                const idx = allEvents.findIndex(e => e.id === editingTempEvent.id);
                if (idx !== -1) allEvents.splice(idx, 1);
                editingTempEvent = null;
            }
            showNotification(eventId ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.');
            closeSidePanel(); refreshEvents();
        } else { showNotification('오류: ' + data.message); }
    } catch (error) {
        console.error('일정 저장 실패:', error);
        showNotification('일정 저장 중 오류가 발생했습니다.');
    }
}


async function deleteEvent(eventId) {
    if (!eventId) return;
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.status === 'success') {
            showNotification('일정이 삭제되었습니다.');
            closeSidePanel(); refreshEvents();
        } else { showNotification('오류: ' + data.message); }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        showNotification('일정 삭제 중 오류가 발생했습니다.');
    }
}

async function updateEventDate(eventId, start, end) {
    const event = allEvents.find(e => String(e.id) == String(eventId));
    if (!event) return;
    const isAllDay = event.allDay;
    const eventData = {};

    if (isAllDay) {
        eventData.start_date = formatDate(start);
        if (end) {
            const endDate = new Date(end); endDate.setDate(endDate.getDate() - 1);
            eventData.end_date = (endDate >= start) ? formatDate(endDate) : formatDate(start);
        } else { eventData.end_date = null; }
        eventData.start_time = null; eventData.end_time = null; eventData.all_day = true;
    } else {
        const startDateTime = new Date(start);
        eventData.start_date = formatDate(startDateTime); eventData.start_time = formatTime(startDateTime);
        if (end) {
            const endDateTime = new Date(end);
            if (endDateTime > startDateTime) {
                eventData.end_date = formatDate(endDateTime); eventData.end_time = formatTime(endDateTime);
            } else {
                eventData.end_date = eventData.start_date;
                const defaultEndTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
                eventData.end_time = formatTime(defaultEndTime);
            }
        } else { eventData.end_date = null; eventData.end_time = null; }
        eventData.all_day = false;
    }
    try {
        const eventIdInt = parseInt(eventId, 10);
        if (isNaN(eventIdInt)) {
             if (typeof eventId === 'string' && eventId.startsWith('temp-')) {
                 const tempEventIndex = allEvents.findIndex(e => e.id === eventId);
                 if (tempEventIndex !== -1 && calendar) {
                    allEvents[tempEventIndex].start = start.toISOString ? start.toISOString() : formatDate(start);
                    allEvents[tempEventIndex].end = end ? (end.toISOString ? end.toISOString() : formatDate(end)) : null;
                    calendar.refetchEvents();
                 }
                 return;
             }
             throw new Error("Invalid Event ID");
        }
        const response = await fetch(`/api/calendar/events/${eventIdInt}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        const data = await response.json();
        if (data.status === 'success') { refreshEvents(); }
        else { showNotification('오류: ' + data.message); if(calendar) calendar.refetchEvents(); }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
        showNotification('일정 업데이트 중 오류가 발생했습니다.');
        if(calendar) calendar.refetchEvents();
    }
}


// ==================== 카테고리 모달 ====================
function openCategoryModal() {
    const modal = document.getElementById('categoryModalOverlay');
    if(modal) modal.classList.add('active');
    const nameInput = document.getElementById('categoryName');
    if(nameInput) nameInput.focus();
}

function closeCategoryModal() {
    const modal = document.getElementById('categoryModalOverlay');
    if(!modal) return;
    modal.classList.remove('active');
    const form = document.getElementById('categoryForm');
    if(form) form.reset();
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
    const defaultColorOption = document.querySelector('.color-option[data-color="#1976D2"]');
    if (defaultColorOption) defaultColorOption.classList.add('active');
    const colorInput = document.getElementById('categoryColor');
    if(colorInput) colorInput.value = '#1976D2';
}


async function saveCategory() {
    const nameInput = document.getElementById('categoryName');
    const colorInput = document.getElementById('categoryColor');
    if(!nameInput || !colorInput) return;
    const name = nameInput.value.trim();
    const color = colorInput.value;
    if (!name) { showNotification('카테고리 이름을 입력해주세요.'); return; }
    try {
        const response = await fetch('/api/calendar/categories', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, color: color })
        });
        const data = await response.json();
        if (data.status === 'success') {
            showNotification('카테고리가 추가되었습니다.');
            closeCategoryModal(); loadCategories();
        } else { showNotification('오류: ' + data.message); }
    } catch (error) {
        console.error('카테고리 저장 실패:', error);
        showNotification('카테고리 저장 중 오류가 발생했습니다.');
    }
}

async function deleteCategory(categoryId) {
    if (!confirm('이 카테고리를 삭제하시겠습니까?\n카테고리에 속한 모든 일정도 함께 삭제됩니다.')) return;
    try {
        const response = await fetch(`/api/calendar/categories/${categoryId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.status === 'success') {
            showNotification('카테고리가 삭제되었습니다.');
            loadCategories(); refreshEvents();
        } else { showNotification('오류: ' + data.message); }
    } catch (error) {
        console.error('카테고리 삭제 실패:', error);
        showNotification('카테고리 삭제 중 오류가 발생했습니다.');
    }
}

// ==================== 유틸리티 함수 ====================
function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        try { date = new Date(date); if (isNaN(date)) return 'Invalid Date'; }
        catch (e) { return 'Invalid Date'; }
    }
    return date.toISOString().split('T')[0]; // Use ISO format YYYY-MM-DD
}


function updateMainTitle(title) {
    const titleEl = document.getElementById('calendarMainTitle');
    if(titleEl) titleEl.textContent = title;
}

function refreshEvents() {
    if(!calendar) return;
    const view = calendar.view;
    if (view && view.activeStart && view.activeEnd) {
        loadEventsInRange(view.activeStart, view.activeEnd);
    } else {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        loadEventsInRange(startOfMonth, endOfMonth);
    }
}


function showNotification(message) {
    const notificationDiv = document.createElement('div');
    // ... (스타일 설정은 동일)
    notificationDiv.style.position = 'fixed';
    notificationDiv.style.bottom = '20px';
    notificationDiv.style.left = '50%';
    notificationDiv.style.transform = 'translateX(-50%)';
    notificationDiv.style.background = 'rgba(0, 0, 0, 0.7)';
    notificationDiv.style.color = 'white';
    notificationDiv.style.padding = '10px 20px';
    notificationDiv.style.borderRadius = '5px';
    notificationDiv.style.zIndex = '2000';
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    setTimeout(() => notificationDiv.remove(), 3000);
}


function showEventPreview(event) {
    const desc = event.extendedProps.description || '설명 없음';
    alert(`${event.title}\n\n${desc}`);
}

function formatTime(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        try { date = new Date(date); if (isNaN(date)) return '00:00'; }
        catch (e) { return '00:00'; }
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}


function getWeekRangeForDate(date) {
    if (!date || isNaN(new Date(date))) return null;
    const targetDate = new Date(date); targetDate.setHours(0, 0, 0, 0);
    const dayOfWeek = targetDate.getDay();
    const weekStart = new Date(targetDate); weekStart.setDate(targetDate.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { start: weekStart, end: weekEnd };
}


// ==================== 드래그로 일정 생성 (NEW) ====================
function createEventByDrag(start, end, allDay) {
    if (!allDay) {
        const duration = (end - start) / (1000 * 60);
        if (duration < 60) end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    const tempEvent = createTempEvent(start, end, allDay);
    if (tempEvent) { // tempEvent 생성 성공 시에만 진행
        editingTempEvent = tempEvent;
        openSidePanelForEdit(tempEvent);
    }
}


function createTempEvent(start, end, allDay) {
    const tempId = 'temp-' + Date.now();
    const defaultCategory = categories.find(c => !c.is_system);
    if (!defaultCategory) {
        showNotification("기본 카테고리를 찾을 수 없습니다. 카테고리를 먼저 생성해주세요.");
        return null; // 카테고리 없으면 임시 이벤트 생성 불가
    }

    const tempEventData = {
        id: tempId, title: '제목 없음',
        start: allDay ? formatDate(start) : start.toISOString(),
        end: allDay ? (end ? formatDate(new Date(end.getTime())) : null) : (end ? end.toISOString() : null),
        allDay: allDay,
        backgroundColor: defaultCategory.color,
        borderColor: defaultCategory.color,
        extendedProps: { category_id: defaultCategory.id, description: '', is_temp: true }
    };

    if(calendar) {
        const addedEvent = calendar.addEvent(tempEventData); // 캘린더에 직접 추가하고 객체 반환받기
        // allEvents 배열에도 추가 (선택적: refetchEvents 대신 로컬 관리)
        allEvents.push(calendarEventToPlainObject(addedEvent));
        return calendarEventToPlainObject(addedEvent); // 일반 객체로 변환하여 반환
    } else {
        return null;
    }
}

// FullCalendar Event 객체를 일반 객체로 변환 (allEvents 배열 저장용)
function calendarEventToPlainObject(fcEvent) {
    if (!fcEvent) return null;
    return {
        id: fcEvent.id,
        title: fcEvent.title,
        start: fcEvent.startStr,
        end: fcEvent.endStr,
        allDay: fcEvent.allDay,
        backgroundColor: fcEvent.backgroundColor,
        borderColor: fcEvent.borderColor,
        extendedProps: { ...fcEvent.extendedProps } // 깊은 복사
    };
}


function openSidePanelForEdit(tempEvent) {
    const form = document.getElementById('eventForm'); if (!form) return;
    form.reset();
    selectedEventId = null;

    const titleInput = document.getElementById('eventTitle');
    const categorySelect = document.getElementById('eventCategory');
    const allDayCheckbox = document.getElementById('eventAllDay');
    const startDateInput = document.getElementById('eventStartDate');
    const endDateInput = document.getElementById('eventEndDate');
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');
    const recurrenceSelect = document.getElementById('eventRecurrence');
    const recurrenceOptionsDiv = document.getElementById('recurrenceOptions');
    const recurrenceEndDateInput = document.getElementById('eventRecurrenceEndDate');
    const deleteBtn = document.getElementById('deleteEventBtn');

    if(titleInput) titleInput.value = ''; // 제목 비우기
    if(categorySelect) categorySelect.value = tempEvent.extendedProps.category_id;
    if(allDayCheckbox) allDayCheckbox.checked = tempEvent.allDay;

    const startDate = tempEvent.start.split('T')[0];
    if(startDateInput) startDateInput.value = startDate;
    let endDate = '';
    if (tempEvent.end) {
        endDate = tempEvent.end.split('T')[0];
        if (tempEvent.allDay) {
             const endDateObj = new Date(endDate + 'T00:00:00');
             endDateObj.setDate(endDateObj.getDate() - 1); endDate = formatDate(endDateObj);
        }
    }
    if(endDateInput) endDateInput.value = endDate;

    if (!tempEvent.allDay) {
        const start = new Date(tempEvent.start);
        const end = tempEvent.end ? new Date(tempEvent.end) : null;
        if(startTimeInput) {startTimeInput.value = formatTime(start); startTimeInput.style.display = 'block';}
        if(endTimeInput) {endTimeInput.value = end ? formatTime(end) : ''; endTimeInput.style.display = 'block';}
    } else {
        if(startTimeInput) {startTimeInput.value = ''; startTimeInput.style.display = 'none';}
        if(endTimeInput) {endTimeInput.value = ''; endTimeInput.style.display = 'none';}
    }
     if(recurrenceSelect) recurrenceSelect.value = '';
     if(recurrenceOptionsDiv) recurrenceOptionsDiv.style.display = 'none';
     if(recurrenceEndDateInput) recurrenceEndDateInput.value = '';
    if(deleteBtn) deleteBtn.style.display = 'none';
    showEditView();
    setTimeout(() => titleInput?.focus(), 100);
}


// ==================== 실시간 양방향 바인딩 (NEW) ====================
function setupRealtimeBinding() {
    const titleInput = document.getElementById('eventTitle');
    const categorySelect = document.getElementById('eventCategory');
    const startDateInput = document.getElementById('eventStartDate');
    const endDateInput = document.getElementById('eventEndDate');
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');
    const allDayCheckbox = document.getElementById('eventAllDay');

    if(titleInput) titleInput.addEventListener('input', function() {
        if (editingTempEvent && calendar) {
            const event = calendar.getEventById(editingTempEvent.id);
            if (event) event.setProp('title', this.value || '제목 없음');
        }
    });

    if(categorySelect) categorySelect.addEventListener('change', function() {
        if (editingTempEvent && calendar) {
            const category = categories.find(c => c.id == this.value);
            const event = calendar.getEventById(editingTempEvent.id);
            if (event && category) {
                event.setProp('backgroundColor', category.color);
                event.setProp('borderColor', category.color);
                event.setExtendedProp('category_id', parseInt(category.id, 10));
            }
        }
    });

    const dateInputs = [startDateInput, endDateInput, startTimeInput, endTimeInput, allDayCheckbox];
    dateInputs.forEach(input => {
        if(input) input.addEventListener('change', function() {
            if (editingTempEvent) updateTempEventFromForm();
        });
    });
}


function updateTempEventFromForm() {
    if (!editingTempEvent || !calendar) return;
    const event = calendar.getEventById(editingTempEvent.id); if (!event) return;

    const startDateInput = document.getElementById('eventStartDate');
    const endDateInput = document.getElementById('eventEndDate');
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');
    const allDayCheckbox = document.getElementById('eventAllDay');
    if(!startDateInput || !allDayCheckbox) return;

    const startDate = startDateInput.value;
    let endDate = endDateInput?.value;
    const startTime = startTimeInput?.value;
    const endTime = endTimeInput?.value;
    const isAllDay = allDayCheckbox.checked;

    if (isAllDay) {
        event.setAllDay(true); event.setStart(startDate);
        if (endDate) {
             const endDateObj = new Date(endDate + 'T00:00:00');
             endDateObj.setDate(endDateObj.getDate() + 1); event.setEnd(formatDate(endDateObj));
        } else { event.setEnd(null); }
    } else {
        event.setAllDay(false);
        const newStartStr = startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`;
        const newEndStr = endTime ? `${endDate || startDate}T${endTime}:00` : null;
        const newStart = new Date(newStartStr);
        let newEnd = newEndStr ? new Date(newEndStr) : null;
        if (newEnd && newEnd <= newStart) {
            newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
        }
        event.setStart(newStart); event.setEnd(newEnd);
    }
}


function updateFormFromTempEvent(event) {
    const startDate = event.start; const endDate = event.end; const isAllDay = event.allDay;

    const startDateInput = document.getElementById('eventStartDate');
    const endDateInput = document.getElementById('eventEndDate');
    const allDayCheckbox = document.getElementById('eventAllDay');
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');
    if(!startDateInput || !allDayCheckbox) return;

    startDateInput.value = formatDate(startDate);
    allDayCheckbox.checked = isAllDay;
    let formEndDate = '';
    if (endDate) {
         formEndDate = formatDate(endDate);
         if (isAllDay) {
             const endDateObj = new Date(formEndDate + 'T00:00:00');
             endDateObj.setDate(endDateObj.getDate() - 1); formEndDate = formatDate(endDateObj);
         }
    }
    if(endDateInput) endDateInput.value = formEndDate;

    if (!isAllDay) {
        if(startTimeInput) {startTimeInput.value = formatTime(startDate); startTimeInput.style.display = 'block';}
        if(endTimeInput) {endTimeInput.value = endDate ? formatTime(endDate) : ''; endTimeInput.style.display = 'block';}
    } else {
        if(startTimeInput) {startTimeInput.value = ''; startTimeInput.style.display = 'none';}
        if(endTimeInput) {endTimeInput.value = ''; endTimeInput.style.display = 'none';}
    }
}

// Ensure calendar resizes when sidebar animation finishes
const sidebarEl = document.getElementById('calendarSidebar');
if (sidebarEl) {
    sidebarEl.addEventListener('transitionend', () => {
        if (calendar) {
            calendar.updateSize();
        }
    });
}