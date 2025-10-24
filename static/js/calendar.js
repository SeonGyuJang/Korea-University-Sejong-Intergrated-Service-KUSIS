// 캘린더 JavaScript

let calendar;
let categories = [];
let events = [];
let visibleCategories = new Set();

// DOM이 로드되면 초기화
document.addEventListener('DOMContentLoaded', function() {
    initializeCalendar();
    loadCategories();
    setupEventListeners();
});

// 캘린더 초기화
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: {
            today: '오늘',
            month: '월',
            week: '주',
            day: '일'
        },
        editable: true,
        selectable: true,
        selectMirror: true,
        dayMaxEvents: true,
        weekends: true,

        // 날짜 클릭 (빈 공간 클릭)
        dateClick: function(info) {
            openEventModal(null, info.dateStr);
        },

        // 이벤트 클릭
        eventClick: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

            if (isSystem) {
                alert('시스템 일정은 수정할 수 없습니다.');
                return;
            }

            openEventModal(eventId);
        },

        // 이벤트 드래그 앤 드롭
        eventDrop: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

            if (isSystem) {
                alert('시스템 일정은 이동할 수 없습니다.');
                info.revert();
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 이벤트 리사이즈
        eventResize: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

            if (isSystem) {
                alert('시스템 일정은 수정할 수 없습니다.');
                info.revert();
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 이벤트 소스
        events: function(info, successCallback, failureCallback) {
            loadEvents(info.start, info.end, successCallback, failureCallback);
        }
    });

    calendar.render();
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 일정 추가 버튼
    document.getElementById('addEventBtn').addEventListener('click', function() {
        openEventModal();
    });

    // 카테고리 관리 버튼
    document.getElementById('manageCategoriesBtn').addEventListener('click', function() {
        openCategoryModal();
    });

    // 모달 닫기 버튼들
    document.getElementById('closeModalBtn').addEventListener('click', closeEventModal);
    document.getElementById('closeCategoryModalBtn').addEventListener('click', closeCategoryModal);
    document.getElementById('cancelEventBtn').addEventListener('click', closeEventModal);

    // 모달 외부 클릭 시 닫기
    window.addEventListener('click', function(event) {
        const eventModal = document.getElementById('eventModal');
        const categoryModal = document.getElementById('categoryModal');

        if (event.target === eventModal) {
            closeEventModal();
        }
        if (event.target === categoryModal) {
            closeCategoryModal();
        }
    });

    // 일정 폼 제출
    document.getElementById('eventForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveEvent();
    });

    // 일정 삭제 버튼
    document.getElementById('deleteEventBtn').addEventListener('click', function() {
        const eventId = document.getElementById('eventId').value;
        if (confirm('이 일정을 삭제하시겠습니까?')) {
            deleteEvent(eventId);
        }
    });

    // 종일 일정 체크박스
    document.getElementById('eventAllDay').addEventListener('change', function() {
        const isAllDay = this.checked;
        document.getElementById('startTimeGroup').style.display = isAllDay ? 'none' : 'block';
        document.getElementById('endTimeGroup').style.display = isAllDay ? 'none' : 'block';
    });

    // 카테고리 폼 제출
    document.getElementById('categoryForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveCategory();
    });
}

// 카테고리 로드
async function loadCategories() {
    try {
        const response = await fetch('/api/calendar/categories');
        const data = await response.json();

        if (data.status === 'success') {
            categories = data.categories;

            // 모든 카테고리를 기본적으로 표시
            visibleCategories.clear();
            categories.forEach(cat => visibleCategories.add(cat.id));

            renderCategoryFilter();
            renderCategorySelect();
            renderCategoryManagementList();
        }
    } catch (error) {
        console.error('카테고리 로드 실패:', error);
        alert('카테고리를 불러오는 중 오류가 발생했습니다.');
    }
}

// 카테고리 필터 렌더링
function renderCategoryFilter() {
    const filterList = document.getElementById('categoryList');
    filterList.innerHTML = '';

    categories.forEach(category => {
        const badge = document.createElement('div');
        badge.className = 'category-badge active';
        if (category.is_system) {
            badge.classList.add('system');
        }
        badge.style.backgroundColor = category.color + '20';
        badge.style.color = category.color;

        badge.innerHTML = `
            <span class="color-dot" style="background-color: ${category.color}"></span>
            <span>${category.name}</span>
        `;

        badge.addEventListener('click', function() {
            toggleCategoryVisibility(category.id, badge);
        });

        filterList.appendChild(badge);
    });
}

// 카테고리 가시성 토글
function toggleCategoryVisibility(categoryId, badgeElement) {
    if (visibleCategories.has(categoryId)) {
        visibleCategories.delete(categoryId);
        badgeElement.classList.remove('active');
        badgeElement.style.opacity = '0.4';
    } else {
        visibleCategories.add(categoryId);
        badgeElement.classList.add('active');
        badgeElement.style.opacity = '1';
    }

    // 캘린더 새로고침
    calendar.refetchEvents();
}

// 카테고리 셀렉트 렌더링
function renderCategorySelect() {
    const select = document.getElementById('eventCategory');
    select.innerHTML = '';

    // 사용자 카테고리만 추가 (시스템 카테고리는 제외)
    categories.filter(cat => !cat.is_system).forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });
}

// 카테고리 관리 리스트 렌더링
function renderCategoryManagementList() {
    const list = document.getElementById('categoryManagementList');
    list.innerHTML = '';

    categories.forEach(category => {
        const item = document.createElement('div');
        item.className = 'category-item';

        item.innerHTML = `
            <div class="category-item-info">
                <div class="category-item-color" style="background-color: ${category.color}"></div>
                <span class="category-item-name">${category.name}</span>
                ${category.is_system ? '<span class="category-item-badge">시스템</span>' : ''}
            </div>
            ${!category.is_system ? `
                <div class="category-item-actions">
                    <button class="delete-btn" onclick="deleteCategory(${category.id})">
                        <i class="fas fa-trash"></i> 삭제
                    </button>
                </div>
            ` : ''}
        `;

        list.appendChild(item);
    });
}

// 이벤트 로드
async function loadEvents(start, end, successCallback, failureCallback) {
    try {
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];

        const response = await fetch(`/api/calendar/events?start=${startStr}&end=${endStr}`);
        const data = await response.json();

        if (data.status === 'success') {
            // 가시성 필터 적용
            const filteredEvents = data.events.filter(event =>
                visibleCategories.has(event.extendedProps.category_id)
            );
            successCallback(filteredEvents);
        } else {
            failureCallback(data.message);
        }
    } catch (error) {
        console.error('이벤트 로드 실패:', error);
        failureCallback(error);
    }
}

// 일정 모달 열기
function openEventModal(eventId = null, defaultDate = null) {
    const modal = document.getElementById('eventModal');
    const modalTitle = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteEventBtn');
    const form = document.getElementById('eventForm');

    form.reset();
    document.getElementById('eventId').value = '';

    if (eventId) {
        // 수정 모드
        modalTitle.textContent = '일정 수정';
        deleteBtn.style.display = 'block';
        loadEventData(eventId);
    } else {
        // 추가 모드
        modalTitle.textContent = '일정 추가';
        deleteBtn.style.display = 'none';

        if (defaultDate) {
            document.getElementById('eventStartDate').value = defaultDate;
        } else {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('eventStartDate').value = today;
        }
    }

    modal.classList.add('active');
}

// 일정 데이터 로드
async function loadEventData(eventId) {
    try {
        const response = await fetch('/api/calendar/events');
        const data = await response.json();

        if (data.status === 'success') {
            const event = data.events.find(e => e.id == eventId);
            if (event) {
                document.getElementById('eventId').value = event.id;
                document.getElementById('eventTitle').value = event.title;
                document.getElementById('eventCategory').value = event.extendedProps.category_id;
                document.getElementById('eventDescription').value = event.extendedProps.description || '';
                document.getElementById('eventAllDay').checked = event.allDay;

                // 날짜 파싱
                const startDate = event.start.split('T')[0];
                document.getElementById('eventStartDate').value = startDate;

                if (event.end) {
                    const endDate = event.end.split('T')[0];
                    document.getElementById('eventEndDate').value = endDate;
                }

                // 시간 설정
                if (!event.allDay && event.start.includes('T')) {
                    const startTime = event.start.split('T')[1].substring(0, 5);
                    document.getElementById('eventStartTime').value = startTime;
                    document.getElementById('startTimeGroup').style.display = 'block';

                    if (event.end && event.end.includes('T')) {
                        const endTime = event.end.split('T')[1].substring(0, 5);
                        document.getElementById('eventEndTime').value = endTime;
                        document.getElementById('endTimeGroup').style.display = 'block';
                    }
                }
            }
        }
    } catch (error) {
        console.error('일정 로드 실패:', error);
        alert('일정을 불러오는 중 오류가 발생했습니다.');
    }
}

// 일정 모달 닫기
function closeEventModal() {
    document.getElementById('eventModal').classList.remove('active');
}

// 일정 저장
async function saveEvent() {
    const eventId = document.getElementById('eventId').value;
    const title = document.getElementById('eventTitle').value.trim();
    const categoryId = document.getElementById('eventCategory').value;
    const description = document.getElementById('eventDescription').value.trim();
    const allDay = document.getElementById('eventAllDay').checked;
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;

    if (!title || !categoryId || !startDate) {
        alert('필수 항목을 입력해주세요.');
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
        end_time: allDay ? null : endTime
    };

    try {
        let response;
        if (eventId) {
            // 수정
            response = await fetch(`/api/calendar/events/${eventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        } else {
            // 추가
            response = await fetch('/api/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        }

        const data = await response.json();

        if (data.status === 'success') {
            alert(eventId ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.');
            closeEventModal();
            calendar.refetchEvents();
        } else {
            alert('오류: ' + data.message);
        }
    } catch (error) {
        console.error('일정 저장 실패:', error);
        alert('일정 저장 중 오류가 발생했습니다.');
    }
}

// 일정 삭제
async function deleteEvent(eventId) {
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            alert('일정이 삭제되었습니다.');
            closeEventModal();
            calendar.refetchEvents();
        } else {
            alert('오류: ' + data.message);
        }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        alert('일정 삭제 중 오류가 발생했습니다.');
    }
}

// 일정 날짜 업데이트 (드래그 앤 드롭)
async function updateEventDate(eventId, start, end) {
    const startDate = start.toISOString().split('T')[0];
    const endDate = end ? end.toISOString().split('T')[0] : null;

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
            console.log('일정이 이동되었습니다.');
        } else {
            alert('오류: ' + data.message);
            calendar.refetchEvents();
        }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
        alert('일정 업데이트 중 오류가 발생했습니다.');
        calendar.refetchEvents();
    }
}

// 카테고리 모달 열기
function openCategoryModal() {
    const modal = document.getElementById('categoryModal');
    modal.classList.add('active');
    renderCategoryManagementList();
}

// 카테고리 모달 닫기
function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
}

// 카테고리 저장
async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const color = document.getElementById('categoryColor').value;

    if (!name) {
        alert('카테고리 이름을 입력해주세요.');
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
            alert('카테고리가 추가되었습니다.');
            document.getElementById('categoryForm').reset();
            document.getElementById('categoryColor').value = '#1976D2';
            loadCategories();
        } else {
            alert('오류: ' + data.message);
        }
    } catch (error) {
        console.error('카테고리 저장 실패:', error);
        alert('카테고리 저장 중 오류가 발생했습니다.');
    }
}

// 카테고리 삭제
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
            alert('카테고리가 삭제되었습니다.');
            loadCategories();
            calendar.refetchEvents();
        } else {
            alert('오류: ' + data.message);
        }
    } catch (error) {
        console.error('카테고리 삭제 실패:', error);
        alert('카테고리 삭제 중 오류가 발생했습니다.');
    }
}
