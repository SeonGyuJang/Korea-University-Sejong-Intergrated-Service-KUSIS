document.addEventListener('DOMContentLoaded', () => {
    // --- 사이드바 토글 기능 ---
    const leftSidebarToggle = document.getElementById('leftSidebarToggle');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');
    const sidebarLeft = document.getElementById('sidebarLeft');
    const sidebarRight = document.getElementById('sidebarRight');

    if (leftSidebarToggle && sidebarLeft) {
        leftSidebarToggle.addEventListener('click', () => {
            sidebarLeft.classList.toggle('collapsed');
        });
    }

    if (rightSidebarToggle && sidebarRight) {
        rightSidebarToggle.addEventListener('click', () => {
            sidebarRight.classList.toggle('expanded');
        });
    }
    
    // --- (신규) Request 4: 알림 드롭다운 Logic ---
    const notificationToggle = document.getElementById('notificationToggle');
    const notificationDropdown = document.getElementById('notificationDropdown');

    if (notificationToggle && notificationDropdown) {
        notificationToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from propagating to document
            notificationDropdown.classList.toggle('active');
        });

        // --- (신규) 알림 위젯 내부 탭 Logic ---
        const tabs = notificationDropdown.querySelectorAll('.notification-tabs .tab');
        const contents = notificationDropdown.querySelectorAll('.notification-content .tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // 탭 활성화 상태 변경
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');

                // 컨텐츠 표시 상태 변경
                const targetId = e.currentTarget.dataset.tab;
                contents.forEach(c => {
                    if (c.id === targetId) {
                        c.classList.add('active');
                    } else {
                        c.classList.remove('active');
                    }
                });
            });
        });
    }

    // (신규) 다른 곳 클릭 시 알림 드롭다운 닫기
    document.addEventListener('click', (e) => {
        if (notificationDropdown && notificationDropdown.classList.contains('active')) {
            // 드롭다운 자신이나 토글 버튼이 아니면 닫기
            if (!notificationDropdown.contains(e.target) && !notificationToggle.contains(e.target)) {
                notificationDropdown.classList.remove('active');
            }
        }
    });
    // --- (신규) 알림 로직 종료 ---

    // --- (수정) Request 1: Quick Links (자주 찾는 사이트) Logic ---
    
    // (수정) "추가하기" 버튼이 있는지 (즉, 로그인 상태인지) 확인
    if (document.getElementById('addLinkBtn')) {
        loadUserQuickLinks(); // (수정) API 호출 함수 실행
        setupQuickLinkModal();
    }
});

/**
 * (수정) Request 1: API에서 *사용자* 퀵 링크를 로드하여 렌더링
 * (함수 이름 변경: loadQuickLinks -> loadUserQuickLinks)
 */
async function loadUserQuickLinks() {
    // (수정) 기본 링크(quickLinkList)가 아닌, 사용자 링크 컨테이너를 대상으로 함
    const listContainer = document.getElementById('userQuickLinkList'); 
    if (!listContainer) return;

    try {
        const response = await fetch('/api/quick-links');
        
        // (수정) 로그아웃 상태(401) 등일 경우 함수 종료 (이제 DOMContentLoaded에서 체크하므로 이 코드는 안전장치)
        if (!response.ok) {
            listContainer.innerHTML = '';
            return; 
        }
        
        const links = await response.json();
        listContainer.innerHTML = ''; // (유지) 사용자 링크 목록만 비우기
        
        links.forEach(link => {
            const linkEl = document.createElement('a');
            linkEl.href = link.url;
            linkEl.target = '_blank';
            linkEl.className = 'quick-link';
            linkEl.rel = 'noopener noreferrer'; // 보안 강화

            // (신규) 아이콘 랜덤 색상 배정 (아이콘이 없을 경우 대비)
            const defaultIcon = 'fas fa-globe';
            const iconClass = link.icon_url || defaultIcon;

            linkEl.innerHTML = `
                <i class="${iconClass}" style="${generateIconStyle(iconClass)}"></i>
                <span class="link-text">${link.title}</span>
                <span class="quick-link-delete" data-id="${link.id}" role="button" aria-label="삭제">&times;</span>
            `;

            // [수정] 삭제 버튼 이벤트 리스너 - 안정성 강화
            const deleteBtn = linkEl.querySelector('.quick-link-delete');

            // mousedown 이벤트로 변경하여 더 빠른 반응
            deleteBtn.addEventListener('mousedown', async (e) => {
                e.preventDefault(); // 링크 이동 방지
                e.stopPropagation(); // 버블링 방지
                e.stopImmediatePropagation(); // 모든 이벤트 전파 차단
            });

            // click 이벤트는 실제 삭제 처리
            deleteBtn.addEventListener('click', async (e) => {
                e.preventDefault(); // 링크 이동 방지
                e.stopPropagation(); // 버블링 방지
                e.stopImmediatePropagation(); // 모든 이벤트 전파 차단

                if (confirm(`'${link.title}' 링크를 삭제하시겠습니까?`)) {
                    await deleteQuickLink(link.id);
                }
            });

            // [신규] 링크 클릭 시 삭제 버튼 영역 체크
            linkEl.addEventListener('click', (e) => {
                // 삭제 버튼이나 그 자식 요소를 클릭한 경우 링크 이동 방지
                if (e.target.closest('.quick-link-delete')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            listContainer.appendChild(linkEl);
        });

    } catch (error) {
        console.error('Failed to load user quick links:', error);
        // (수정) "링크 로드 실패" 메시지를 UI에 표시하지 않음
    }
}

/**
 * (신규) Request 1: 퀵 링크 모달 설정
 */
function setupQuickLinkModal() {
    const modal = document.getElementById('quickLinkModal');
    const addBtn = document.getElementById('addLinkBtn');
    const saveBtn = document.getElementById('saveQuickLinkBtn');
    const form = document.getElementById('quickLinkForm');

    if (!modal || !addBtn || !saveBtn || !form) return;

    // 모달 열기
    addBtn.addEventListener('click', (e) => {
        e.preventDefault(); // javascript:void(0); 링크 기본 동작 방지
        form.reset(); // 폼 초기화
        modal.classList.add('active');
    });

    // 모달 닫기 (base.html의 .modal-close가 이미 처리)

    // 저장 버튼 클릭
    saveBtn.addEventListener('click', async () => {
        const title = document.getElementById('linkTitle').value.trim();
        const url = document.getElementById('linkUrl').value.trim();
        const icon_url = document.getElementById('linkIcon').value.trim();

        if (!title || !url) {
            alert('사이트 이름과 URL을 모두 입력해주세요.');
            return;
        }
        
        saveBtn.disabled = true;
        saveBtn.textContent = '저장 중...';

        try {
            const response = await fetch('/api/quick-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, url, icon_url })
            });

            const result = await response.json();

            if (response.ok) {
                modal.classList.remove('active');
                loadUserQuickLinks(); // (수정) 목록 새로고침
            } else {
                alert(`저장 실패: ${result.message}`);
            }
        } catch (error) {
            console.error('Failed to save quick link:', error);
            alert('링크 저장 중 오류가 발생했습니다.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '저장';
        }
    });
}

/**
 * (신규) Request 1: 퀵 링크 삭제 API 호출
 */
async function deleteQuickLink(linkId) {
    try {
        const response = await fetch(`/api/quick-links/${linkId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const result = await response.json();
            alert(`삭제 실패: ${result.message || '알 수 없는 오류'}`);
            return;
        }

        // 성공 시 목록 새로고침
        await loadUserQuickLinks();

    } catch (error) {
        console.error('Failed to delete quick link:', error);
        alert('링크 삭제 중 오류가 발생했습니다.');
    }
}


/**
 * (신규) Request 1: 아이콘 스타일 생성 (아이콘 클래스에 따라 다른 색상)
 */
function generateIconStyle(iconClass) {
    const colors = {
        'google': '#4285F4',
        'youtube': '#FF0000',
        'instagram': 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
        'facebook': '#1877F2',
        'naver': '#03C75A',
        'kakao': '#FEE500',
        'github': '#181717',
        'book': '#A50034', // LMS
        'envelope': '#0073E6', // Mail
        'default': '#7f8c8d' // (기본)
    };

    let style = '';
    let colorKey = 'default';

    for (const key in colors) {
        if (iconClass.includes(key)) {
            colorKey = key;
            break;
        }
    }
    
    const color = colors[colorKey];
    if (color.startsWith('linear-gradient')) {
        style = `background: ${color};`;
    } else {
        style = `background-color: ${color};`;
    }
    
    // 카카오는 글씨만 검정색
    if (colorKey === 'kakao') {
        style += ' color: #3A1D1D;';
    } else {
        style += ' color: white;';
    }

    return style;
}