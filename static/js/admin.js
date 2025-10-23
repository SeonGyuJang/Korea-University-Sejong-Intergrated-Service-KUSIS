// static/js/admin.js
document.addEventListener('DOMContentLoaded', () => {

    // --- 단과대/학과 데이터 로드 및 폼 처리 ---
    const collegeJsonString = document.getElementById('college-data-json')?.value;
    let COLLEGE_DEPARTMENTS = {};
    try {
        if (collegeJsonString) {
            COLLEGE_DEPARTMENTS = JSON.parse(collegeJsonString);
        }
    } catch (e) {
        console.error("단과대학/학과 데이터 파싱 오류:", e);
    }

    // 학과 업데이트 함수 (prefix로 create_, edit_ 등 구분)
    window.updateDepartments = function(prefix = 'create_') {
        const collegeSelect = document.getElementById(`${prefix}college`);
        const deptSelect = document.getElementById(`${prefix}department`);
        if (!collegeSelect || !deptSelect) return;

        const selectedCollege = collegeSelect.value;
        deptSelect.innerHTML = '<option value="" disabled selected>학과 선택</option>'; // 초기화

        if (selectedCollege && COLLEGE_DEPARTMENTS[selectedCollege]) {
            COLLEGE_DEPARTMENTS[selectedCollege].forEach(dept => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                deptSelect.appendChild(option);
            });
            deptSelect.disabled = false;
        } else {
            deptSelect.disabled = true;
        }
    }

    // 페이지 로드 시 '새 사용자 생성' 폼의 학과 초기화
    updateDepartments('create_');


    // --- 사용자 목록 상호작용 ---
    const userListBody = document.getElementById('userListBody');

    if (userListBody) {
        userListBody.addEventListener('change', async (event) => {
            // 권한 변경 처리
            if (event.target.classList.contains('permission-select')) {
                const selectElement = event.target;
                const userId = selectElement.dataset.userId;
                const originalPermission = selectElement.dataset.originalPermission;
                const newPermission = selectElement.value;

                if (newPermission === originalPermission) return; // 변경 없으면 무시

                if (!confirm(`사용자 ${userId}의 권한을 '${selectElement.options[selectElement.selectedIndex].text}'(으)로 변경하시겠습니까?`)) {
                    selectElement.value = originalPermission; // 취소 시 원래 값으로 복원
                    return;
                }

                try {
                    selectElement.disabled = true; // 처리 중 비활성화
                    const response = await fetch(`/admin/users/${userId}/permission`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            // CSRF 토큰이 필요하다면 헤더에 추가
                        },
                        body: JSON.stringify({ permission: newPermission })
                    });

                    const result = await response.json();

                    if (result.status === 'success') {
                        alert(result.message);
                        selectElement.dataset.originalPermission = newPermission; // 원본 값 업데이트

                        // 태그 스타일 업데이트 (선택 사항)
                        const tagSpan = selectElement.closest('tr')?.querySelector('.auth-tag');
                        if (tagSpan) {
                             tagSpan.textContent = result.new_permission_display;
                             tagSpan.className = `auth-tag ${result.new_permission}`; // 클래스 변경
                             if (result.new_permission === 'admin') {
                                 tagSpan.innerHTML = `<i class="fas fa-crown"></i> ${result.new_permission_display}`;
                             } else {
                                 tagSpan.innerHTML = result.new_permission_display;
                             }
                        }

                    } else {
                        throw new Error(result.message || '권한 변경 실패');
                    }
                } catch (error) {
                    console.error("권한 변경 오류:", error);
                    alert(`오류: ${error.message}`);
                    selectElement.value = originalPermission; // 실패 시 원래 값으로 복원
                } finally {
                    selectElement.disabled = false; // 처리 완료 후 활성화 (자신 제외)
                     if(userId === document.body.dataset.currentUserId) { // 만약 현재 사용자 ID를 body 등에 저장해 뒀다면
                         selectElement.disabled = true;
                     }
                }
            }
        });

        userListBody.addEventListener('click', async (event) => {
            // 사용자 삭제 처리
            if (event.target.closest('.delete-user-btn')) {
                const button = event.target.closest('.delete-user-btn');
                const userId = button.dataset.userId;
                const userName = button.dataset.userName;

                if (!confirm(`정말로 사용자 '${userName}' (${userId}) 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 사용자의 모든 데이터가 삭제됩니다.`)) {
                    return;
                }

                try {
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 삭제 중...';

                    const response = await fetch(`/admin/users/${userId}`, {
                        method: 'DELETE',
                        headers: {
                            // CSRF 토큰이 필요하다면 헤더에 추가
                        }
                    });

                    const result = await response.json();

                    if (result.status === 'success') {
                        alert(result.message);
                        // 테이블에서 해당 행 제거
                        button.closest('tr')?.remove();
                        // TODO: 총 회원 수 등 통계 업데이트 필요
                    } else {
                        throw new Error(result.message || '삭제 실패');
                    }
                } catch (error) {
                    console.error("사용자 삭제 오류:", error);
                    alert(`오류: ${error.message}`);
                    button.disabled = false;
                    button.innerHTML = '<i class="fas fa-trash-alt"></i> 삭제';
                }
            }
        });
    }

    // --- 학과 필터링 ---
    const departmentFilter = document.getElementById('departmentFilter');
    if (departmentFilter && userListBody) {
        departmentFilter.addEventListener('change', () => {
            const selectedDepartment = departmentFilter.value;
            const rows = userListBody.querySelectorAll('tr');

            rows.forEach(row => {
                const userDepartment = row.dataset.department;
                // 선택된 학과가 없거나 (전체) 사용자의 학과와 일치하면 보임
                if (!selectedDepartment || userDepartment === selectedDepartment) {
                    row.style.display = ''; // 테이블 행 기본 표시 (보통 table-row)
                } else {
                    row.style.display = 'none'; // 숨김
                }
            });
        });
    }

}); // DOMContentLoaded end