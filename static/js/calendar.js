// ==================== 노션 스타일 캘린더 JavaScript ====================

// 전역 변수
let calendar;
let categories = [];
let allEvents = [];
let visibleCategories = new Set();
let currentMiniCalendarDate = new Date();
let selectedEventId = null;
let touchStartX = 0;
let touchEndX = 0;

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeCalendar();
    loadCategories();
    renderMiniCalendar();
    setupEventListeners();
    setupKeyboardShortcuts();
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
        height: 'auto',
        nowIndicator: true, // 현재 시간 표시
        slotMinTime: '00:00:00',
        slotMaxTime: '24:00:00',

        // 날짜 클릭 (빈 공간) - 우측 패널로 변경
        dateClick: function(info) {
            openSidePanel(null, info.dateStr);
        },

        // 드래그로 범위 선택 - 하단 패널 열기
        select: function(info) {
            const startDate = formatDate(info.start);
            let endDate = null;

            // 종료일이 시작일보다 크면 범위 선택
            const daysDiff = Math.ceil((info.end - info.start) / (1000 * 60 * 60 * 24));
            if (daysDiff > 1) {
                // FullCalendar는 종일 이벤트의 end를 다음날로 설정하므로 1일 빼기
                const adjustedEnd = new Date(info.end);
                adjustedEnd.setDate(adjustedEnd.getDate() - 1);
                endDate = formatDate(adjustedEnd);
            }

            openSidePanel(null, startDate, '', null, endDate);
            // 드래그 영역 유지를 위해 unselect() 호출하지 않음
        },

        // 이벤트 클릭
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

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

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 이동할 수 없습니다.');
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 리사이즈
        eventResize: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 수정할 수 없습니다.');
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 날짜 변경 시
        datesSet: function(info) {
            updateMainTitle(info.view.title);
            loadEventsInRange(info.start, info.end);
        },

        // 이벤트 소스
        events: function(info, successCallback, failureCallback) {
            const filteredEvents = allEvents.filter(event =>
                visibleCategories.has(event.extendedProps.category_id)
            );
            successCallback(filteredEvents);
        }
    });

    calendar.render();
}

// ==================== 미니 캘린더 ====================
function renderMiniCalendar() {
    const miniCalendar = document.getElementById('miniCalendar');
    const year = currentMiniCalendarDate.getFullYear();
    const month = currentMiniCalendarDate.getMonth();

    // 헤더 업데이트
    document.getElementById('miniCalendarTitle').textContent =
        `${year}년 ${month + 1}월`;

    // 그리드 생성
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    let html = '<div class="mini-calendar-grid">';

    // 요일 헤더
    ['일', '월', '화', '수', '목', '금', '토'].forEach(day => {
        html += `<div class="mini-calendar-weekday">${day}</div>`;
    });

    // 이전 달 날짜
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="mini-calendar-day other-month">${prevLastDate - i}</div>`;
    }

    // 현재 달 날짜
    const today = new Date();
    for (let day = 1; day <= lastDate; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isToday = date.toDateString() === today.toDateString();
        const hasEvents = allEvents.some(e => e.start.startsWith(dateStr));

        let classes = 'mini-calendar-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';

        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    // 다음 달 날짜
    const remainingDays = 42 - (firstDay + lastDate);
    for (let day = 1; day <= remainingDays; day++) {
        html += `<div class="mini-calendar-day other-month">${day}</div>`;
    }

    html += '</div>';
    miniCalendar.innerHTML = html;

    // 날짜 클릭 이벤트
    miniCalendar.querySelectorAll('.mini-calendar-day:not(.other-month)').forEach(dayEl => {
        dayEl.addEventListener('click', function() {
            const dateStr = this.dataset.date;
            calendar.gotoDate(dateStr);
        });
    });
}

// ==================== 이벤트 리스너 설정 ====================
function setupEventListeners() {
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
        currentMiniCalendarDate = new Date(today);
        calendar.today();
        renderMiniCalendar();
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
    });

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

    // 터치 스와이프 이벤트 (주간 뷰에서 좌우 이동)
    const calendarEl = document.getElementById('calendar');
    calendarEl.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
    }, false);

    calendarEl.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, false);
}

// ==================== 키보드 단축키 ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // ESC - 패널/모달 닫기
        if (e.key === 'Escape') {
            closeSidePanel();
            closeCategoryModal();
            closeQuickEventModal();
        }
    });
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
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const response = await fetch(`/api/calendar/events?start=${startStr}&end=${endStr}`);
        const data = await response.json();

        if (data.status === 'success') {
            allEvents = data.events;
            calendar.refetchEvents();
            renderMiniCalendar();
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

// ==================== 하단 패널 ====================
function openSidePanel(eventId = null, dateStr = null, title = '', categoryId = null, endDateStr = null) {
    const panel = document.getElementById('bottomPanel');
    const form = document.getElementById('eventForm');
    const deleteBtn = document.getElementById('deleteEventBtn');

    form.reset();
    selectedEventId = eventId;

    if (eventId) {
        // 수정 모드
        loadEventToForm(eventId);
        deleteBtn.style.display = 'flex';
    } else {
        // 추가 모드
        const today = dateStr || formatDate(new Date());
        document.getElementById('eventStartDate').value = today;
        if (endDateStr) {
            document.getElementById('eventEndDate').value = endDateStr;
        }
        if (title) document.getElementById('eventTitle').value = title;
        if (categoryId) document.getElementById('eventCategory').value = categoryId;
        deleteBtn.style.display = 'none';

        // 종일 체크
        document.getElementById('eventStartTime').style.display = 'none';
        document.getElementById('eventEndTime').style.display = 'none';
    }

    panel.classList.add('active');
    updatePreview(); // 미리보기 업데이트
    setupPreviewListeners(); // 실시간 미리보기 이벤트 리스너
}

function closeSidePanel() {
    document.getElementById('bottomPanel').classList.remove('active');
    selectedEventId = null;
    // 드래그 선택은 유지
}

// ==================== 실시간 미리보기 ====================
function setupPreviewListeners() {
    // 이미 설정되었으면 리턴
    if (document.getElementById('eventTitle').dataset.previewSetup) return;
    document.getElementById('eventTitle').dataset.previewSetup = 'true';

    // 제목 변경
    document.getElementById('eventTitle').addEventListener('input', updatePreview);

    // 날짜 변경
    document.getElementById('eventStartDate').addEventListener('change', updatePreview);
    document.getElementById('eventEndDate').addEventListener('change', updatePreview);

    // 시간 변경
    document.getElementById('eventStartTime').addEventListener('change', updatePreview);
    document.getElementById('eventEndTime').addEventListener('change', updatePreview);

    // 종일 체크박스
    document.getElementById('eventAllDay').addEventListener('change', updatePreview);

    // 카테고리 변경
    document.getElementById('eventCategory').addEventListener('change', updatePreview);

    // 설명 변경
    document.getElementById('eventDescription').addEventListener('input', updatePreview);
}

function updatePreview() {
    const title = document.getElementById('eventTitle').value || '일정 제목';
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const allDay = document.getElementById('eventAllDay').checked;
    const categoryId = document.getElementById('eventCategory').value;
    const description = document.getElementById('eventDescription').value;

    // 제목 업데이트
    document.getElementById('previewTitle').textContent = title;

    // 날짜 업데이트
    let dateText = '';
    if (startDate) {
        const startD = new Date(startDate);
        const startFormatted = `${startD.getMonth() + 1}월 ${startD.getDate()}일`;

        if (endDate && endDate !== startDate) {
            const endD = new Date(endDate);
            const endFormatted = `${endD.getMonth() + 1}월 ${endD.getDate()}일`;
            dateText = `${startFormatted} - ${endFormatted}`;
        } else {
            dateText = startFormatted;
        }
    } else {
        dateText = '날짜를 선택하세요';
    }
    document.getElementById('previewDate').textContent = dateText;

    // 시간 업데이트
    let timeText = '';
    if (allDay) {
        timeText = '종일';
    } else if (startTime) {
        timeText = startTime;
        if (endTime) {
            timeText += ` - ${endTime}`;
        }
    } else {
        timeText = '시간을 선택하세요';
    }
    document.getElementById('previewTime').textContent = timeText;

    // 카테고리 업데이트
    if (categoryId) {
        const category = categories.find(cat => cat.id == categoryId);
        if (category) {
            document.getElementById('previewCategory').textContent = category.name;
            document.getElementById('previewEvent').style.borderLeftColor = category.color;
        }
    } else {
        document.getElementById('previewCategory').textContent = '카테고리를 선택하세요';
    }

    // 설명 업데이트
    const descContainer = document.getElementById('previewDescContainer');
    if (description) {
        document.getElementById('previewDescription').textContent = description;
        descContainer.style.display = 'flex';
    } else {
        descContainer.style.display = 'none';
    }
}

async function loadEventToForm(eventId) {
    const event = allEvents.find(e => e.id == eventId);
    if (!event) return;

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
        }
    }

    // 날짜 파싱
    const startDate = event.start.split('T')[0];
    document.getElementById('eventStartDate').value = startDate;

    if (event.end) {
        let endDate = event.end.split('T')[0];
        // FullCalendar는 종일 이벤트의 end를 다음날로 설정하므로 조정
        if (event.allDay) {
            const endDateObj = new Date(endDate);
            endDateObj.setDate(endDateObj.getDate() - 1);
            endDate = formatDate(endDateObj);
        }
        document.getElementById('eventEndDate').value = endDate;
    }

    // 시간
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');

    if (!event.allDay && event.start.includes('T')) {
        const startTime = event.start.split('T')[1].substring(0, 5);
        startTimeInput.value = startTime;
        startTimeInput.style.display = 'block';

        if (event.end && event.end.includes('T')) {
            const endTime = event.end.split('T')[1].substring(0, 5);
            endTimeInput.value = endTime;
            endTimeInput.style.display = 'block';
        }
    } else {
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
        showNotification('필수 항목을 입력해주세요.');
        return;
    }

    const eventData = {
        title: title,
        category_id: parseInt(categoryId),
        description: description,
        start_date: startDate,
        end_date: endDate || null,
        all_day: allDay,
        start_time: allDay ? null : startTime,
        end_time: allDay ? null : endTime,
        recurrence_type: recurrenceType,
        recurrence_end_date: recurrenceEndDate
    };

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
            showNotification(eventId ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.');
            closeSidePanel();
            refreshEvents();
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
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        showNotification('일정 삭제 중 오류가 발생했습니다.');
    }
}

async function updateEventDate(eventId, start, end) {
    const startDate = formatDate(start);
    const endDate = end ? formatDate(end) : null;

    const eventData = {
        start_date: startDate,
        end_date: endDate
    };

    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();

        if (data.status === 'success') {
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message);
            calendar.refetchEvents();
        }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
        calendar.refetchEvents();
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
    document.querySelector('.color-option[data-color="#1976D2"]').classList.add('active');
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
            loadCategories();
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
            loadCategories();
            refreshEvents();
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
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateMainTitle(title) {
    document.getElementById('calendarMainTitle').textContent = title;
}

function refreshEvents() {
    const view = calendar.view;
    loadEventsInRange(view.activeStart, view.activeEnd);
}

function showNotification(message) {
    // 간단한 알림
    alert(message);
}

function showEventPreview(event) {
    // 시스템 이벤트 미리보기
    const desc = event.extendedProps.description || '설명 없음';
    alert(`${event.title}\n\n${desc}`);
}

// ==================== 스와이프 핸들러 ====================
function handleSwipe() {
    const swipeThreshold = 50; // 최소 스와이프 거리 (픽셀)
    const swipeDistance = touchEndX - touchStartX;

    if (Math.abs(swipeDistance) > swipeThreshold) {
        if (swipeDistance > 0) {
            // 오른쪽으로 스와이프 - 이전 주
            calendar.prev();
        } else {
            // 왼쪽으로 스와이프 - 다음 주
            calendar.next();
        }
    }
}
