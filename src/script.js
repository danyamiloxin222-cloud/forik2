// Main ComplaintGenerator class
class ComplaintGenerator {
    constructor() {
        this.currentServer = '1';
        this.currentTab = 'form';
        this.currentTheme = 'light';
        this.performanceMode = true;
        this.soundEnabled = localStorage.getItem('soundEnabled') === 'true';
        this.selectedColor = '';
        this.organizationDatabase = this.loadOrganizationDatabase();
        
        // AutoHotkey integration system
        this.ahkActive = false;
        this.ahkDataFile = './complaint_data.txt';
        this.currentSubmissionQueue = [];
        this.autoSubmitQueue = [];
        this.complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        this.complaintsCache = null; // Will be lazy-loaded
        
        this.initializeApp();
        this.bindEvents();
        this.loadFormState();
        this.loadTemplates();
        this.initializeOCR();
    }

    // Initialize application
    initializeApp() {
        // Load theme from localStorage or default to light
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.currentTheme = savedTheme;
        document.body.setAttribute('data-theme', this.currentTheme);
        this.applyPerformanceMode();
        this.initTemplateEditor();
        
        // Set default datetime
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('violationDate').value = now.toISOString().slice(0, 16);
        
        // Make datetime input fully clickable
        this.setupDateTimeInput();
        
        // Initialize first server as active
        document.querySelector('.server-option[data-server="1"]').classList.add('active');
        
        // Load saved config
        this.loadTelegramConfig();
        this.loadTemplateConfig();
        this.updateProgressBar();
        
        // Start warning notifications
        this.startWarningSystem();
        
        // Check expired complaints periodically
        this.checkExpiredComplaints();
        setInterval(() => this.checkExpiredComplaints(), 60000); // Check every minute
        
        // Request notification permission
        this.requestNotificationPermission();
        
        // Initialize auto-submit system
        this.initializeAutoSubmit();
    }

    // Bind all event listeners
    bindEvents() {
        // Theme selector buttons
        document.querySelectorAll('.theme-btn[data-theme]').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                this.setTheme(theme);
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Custom theme button
        document.getElementById('customThemeBtn')?.addEventListener('click', () => {
            this.openCustomThemeEditor();
        });
        
        // Custom theme editor handlers
        document.getElementById('closeThemeModal')?.addEventListener('click', () => {
            document.getElementById('customThemeModal').style.display = 'none';
        });
        document.getElementById('cancelTheme')?.addEventListener('click', () => {
            document.getElementById('customThemeModal').style.display = 'none';
        });
        document.getElementById('saveCustomTheme')?.addEventListener('click', () => {
            this.saveCustomTheme();
        });
        
        // Update preview on color change
        ['customAccentColor', 'customBgColor', 'customTextColor', 'customCardBg', 'customBorderColor'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                this.updateThemePreview();
            });
        });

        // Set active theme button
        const currentTheme = this.currentTheme || 'light';
        document.querySelector(`.theme-btn[data-theme="${currentTheme}"]`)?.classList.add('active');
        
        // Organization autocomplete
        this.setupOrganizationAutocomplete();
        
        // Server selection
        document.querySelectorAll('.server-option').forEach(option => {
            option.addEventListener('click', (e) => this.selectServer(e.target.closest('.server-option').dataset.server));
        });
        
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabBtn = e.target.closest('.tab-btn');
                const tabName = tabBtn?.dataset.tab || e.target.dataset.tab;
                if (tabName) {
                    this.switchTab(tabName);
                } else {
                    console.warn('Tab name not found in button:', e.target);
                }
            });
        });
        
        // Form events
        document.getElementById('complaintForm').addEventListener('submit', (e) => this.generateComplaint(e));
        document.getElementById('clearForm').addEventListener('click', () => this.clearForm());
        
        // Affiliation change
        document.getElementById('affiliation').addEventListener('change', (e) => this.handleAffiliationChange(e));
        
        // Autocomplete events
        this.setupAutocomplete('yourNickname', 'nicknameTemplates', 'nicknameDropdown');
        this.setupAutocomplete('violation', 'violationTemplates', 'violationDropdown');
        
        // Form field changes for auto-save
        document.querySelectorAll('#complaintForm input, #complaintForm select, #complaintForm textarea').forEach(field => {
            field.addEventListener('input', this.debounce(() => this.saveFormState(), 300));
            field.addEventListener('change', this.debounce(() => this.updateProgressBar(), 100));
            
            // Enter key to move to next field
            if (field.tagName !== 'TEXTAREA' || field.id === 'violation') {
                field.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const form = field.closest('form');
                        const fields = Array.from(form.querySelectorAll('input, select, textarea'));
                        const currentIndex = fields.indexOf(field);
                        if (currentIndex < fields.length - 1) {
                            fields[currentIndex + 1].focus();
                        }
                    }
                });
            }
        });
        
        // Output actions
        document.getElementById('saveComplaint')?.addEventListener('click', () => this.saveComplaint());
        document.getElementById('openForumLink')?.addEventListener('click', () => this.openForumLink());
        
        // History search
        document.getElementById('historySearch')?.addEventListener('input', 
            this.debounce((e) => this.searchHistory(e.target.value), 500));
        
        // Template config
        document.getElementById('saveTemplate')?.addEventListener('click', () => this.saveTemplate());
        document.getElementById('loadTemplate')?.addEventListener('click', () => this.loadTemplate());
        document.getElementById('addRule')?.addEventListener('click', () => this.addTemplateRule());
        document.getElementById('previewTemplate')?.addEventListener('click', () => this.previewTemplate());
        
        // History filter
        document.getElementById('affiliationFilter')?.addEventListener('change', 
            (e) => this.filterHistory(e.target.value));
        
        // Clear history button
        document.getElementById('clearHistoryBtn')?.addEventListener('click', () => this.clearHistory());
        
        // Telegram config
        document.getElementById('saveTelegramConfig')?.addEventListener('click', () => this.saveTelegramConfig());
        document.getElementById('testTelegram')?.addEventListener('click', () => this.testTelegram());
        document.getElementById('sendAllHistory')?.addEventListener('click', () => this.sendAllHistoryToTelegram());
        
        // AutoHotkey integration
        document.getElementById('prepareAHKData')?.addEventListener('click', () => this.prepareAHKData());
        document.getElementById('launchAHK')?.addEventListener('click', () => this.launchAHKScript());
        document.getElementById('selectiveAHK')?.addEventListener('click', () => this.loadSubmitQueueFromHistory());
        document.getElementById('prepareSelectedAHK')?.addEventListener('click', () => this.prepareSelectedAHKData());
        document.getElementById('openAHKLog')?.addEventListener('click', () => this.openAHKLog());
    }

    // Theme management
    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', this.currentTheme);
        localStorage.setItem('theme', this.currentTheme);
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // Server selection
    selectServer(server) {
        this.currentServer = server;
        
        // Update UI
        document.querySelectorAll('.server-option').forEach(option => {
            option.classList.remove('active');
        });
        document.querySelector(`[data-server="${server}"]`).classList.add('active');
        
        // Update affiliation options based on server
        this.updateAffiliationOptions();
    }

    // Update affiliation options based on server
    updateAffiliationOptions() {
        const affiliationSelect = document.getElementById('affiliation');
        const options = affiliationSelect.querySelectorAll('option');
        
        if (this.currentServer === '1') {
            options[2].textContent = 'Госструктура';
            options[3].textContent = 'Криминальная структура';
        } else {
            options[2].textContent = 'Госструктура';
            options[3].textContent = 'Банда';
        }
    }

    // Tab switching
    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (tabButton) {
            tabButton.classList.add('active');
        } else {
            console.warn(`Tab button not found for: ${tabName}`);
        }
        
        // Update active tab pane
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        const tabPane = document.getElementById(tabName);
        if (tabPane) {
            tabPane.classList.add('active');
        } else {
            console.warn(`Tab pane not found for: ${tabName}`);
        }
        
        this.currentTab = tabName;
        
        // Load tab-specific data
        this.loadTabData(tabName);
    }

    // Load data for specific tabs
    loadTabData(tabName) {
        switch(tabName) {
            case 'history':
                this.loadComplaints();
                break;
            case 'templates':
                this.loadStatistics();
                break;
            case 'template-config':
                this.loadTemplateRules();
                break;
            case 'telegram':
                this.loadTelegramStats();
                break;
            case 'autohelp':
                this.loadOCRTab();
                break;
            case 'autosubmit':
                this.loadAutoSubmitTab();
                break;
        }
    }

    // Handle affiliation change
    handleAffiliationChange(e) {
        const affiliationNameGroup = document.getElementById('affiliationNameGroup');
        if (e.target.value === 'none' || e.target.value === '') {
            affiliationNameGroup.style.display = 'none';
            document.getElementById('affiliationName').required = false;
        } else {
            affiliationNameGroup.style.display = 'block';
            document.getElementById('affiliationName').required = true;
        }
        this.updateProgressBar();
    }

    // Enhanced Progress bar update
    updateProgressBar() {
        const form = document.getElementById('complaintForm');
        const requiredFields = ['yourNickname', 'violatorNickname', 'violationDate', 'violation', 'evidence'];
        
        let filledCount = 0;
        let totalFields = requiredFields.length;
        
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && field.value.trim() !== '') {
                filledCount++;
            }
        });
        
        // Check affiliation name if needed
        const affiliation = document.getElementById('affiliation').value;
        if (affiliation !== 'none' && affiliation !== '') {
            totalFields++;
            const affiliationName = document.getElementById('affiliationName');
            if (affiliationName && affiliationName.value.trim() !== '') {
                filledCount++;
            }
        }
        
        const progress = (filledCount / totalFields) * 100;
        const progressBar = document.getElementById('progressBar');
        const oldProgress = parseInt(progressBar.style.width) || 0;
        
        progressBar.style.width = `${progress}%`;
        
        // Milestone celebrations
        if (progress >= 25 && oldProgress < 25) this.celebrateMilestone('25% завершено! 🎉');
        if (progress >= 50 && oldProgress < 50) this.celebrateMilestone('Половина сделана! 🚀');
        if (progress >= 75 && oldProgress < 75) this.celebrateMilestone('Почти готово! ✨');
        if (progress === 100 && oldProgress < 100) this.celebrateMilestone('Всё готово! 🏆');
    }
    
    celebrateMilestone(message) {
        const progressBar = document.getElementById('progressBar');
        progressBar.classList.add('progress-milestone');
        
        setTimeout(() => {
            progressBar.classList.remove('progress-milestone');
        }, 500);
        
        this.playSound('milestone');
        this.showSuccess(message);
    }

    // Form state management
    saveFormState() {
        const formData = {
            yourNickname: document.getElementById('yourNickname').value,
            violatorNickname: document.getElementById('violatorNickname').value,
            violationDate: document.getElementById('violationDate').value,
            violation: document.getElementById('violation').value,
            affiliation: document.getElementById('affiliation').value,
            affiliationName: document.getElementById('affiliationName').value,
            evidence: document.getElementById('evidence').value,
            server: this.currentServer
        };
        localStorage.setItem('complaintFormData', JSON.stringify(formData));
    }

    loadFormState() {
        const savedData = localStorage.getItem('complaintFormData');
        if (savedData) {
            const formData = JSON.parse(savedData);
            
            Object.keys(formData).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    element.value = formData[key];
                }
            });
            
            if (formData.server) {
                this.selectServer(formData.server);
            }
            
            // Handle affiliation display
            if (formData.affiliation && formData.affiliation !== 'none') {
                document.getElementById('affiliationNameGroup').style.display = 'block';
            }
        }
    }

    clearForm() {
        document.getElementById('complaintForm').reset();
        document.getElementById('affiliationNameGroup').style.display = 'none';
        document.getElementById('outputSection').style.display = 'none';
        localStorage.removeItem('complaintFormData');
        this.updateProgressBar();
        
        // Reset datetime to now
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('violationDate').value = now.toISOString().slice(0, 16);
    }

    // Autocomplete functionality
    setupAutocomplete(inputId, storageKey, dropdownId) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        
        if (!input || !dropdown) return;
        
        input.addEventListener('focus', () => this.showAutocomplete(input, dropdown, storageKey));
        input.addEventListener('input', () => this.showAutocomplete(input, dropdown, storageKey));
        input.addEventListener('blur', () => {
            // Delay hiding to allow clicks
            setTimeout(() => dropdown.style.display = 'none', 200);
        });
        
        // Hide on click outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    showAutocomplete(input, dropdown, storageKey) {
        const templates = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const query = input.value.toLowerCase();
        
        // Filter and sort templates
        const filtered = Object.entries(templates)
            .filter(([key, count]) => key.toLowerCase().includes(query))
            .sort((a, b) => b[1] - a[1]) // Sort by usage count
            .slice(0, 5); // Limit to 5 results
        
        if (filtered.length === 0) {
            dropdown.style.display = 'none';
            return;
        }
        
        // Build dropdown HTML
        dropdown.innerHTML = filtered.map(([text, count]) => 
            `<div class="autocomplete-item" data-value="${text}">
                <span>${text}</span>
                <span class="autocomplete-count">${count}</span>
            </div>`
        ).join('');
        
        // Add click handlers
        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                input.value = item.dataset.value;
                dropdown.style.display = 'none';
                this.saveFormState();
                this.updateProgressBar();
            });
        });
        
        dropdown.style.display = 'block';
    }

    // Template management
    updateTemplate(value, storageKey) {
        if (!value.trim()) return;
        
        const templates = JSON.parse(localStorage.getItem(storageKey) || '{}');
        templates[value] = (templates[value] || 0) + 1;
        localStorage.setItem(storageKey, JSON.stringify(templates));
    }

    loadTemplates() {
        this.loadTemplateList('nicknameTemplatesList', 'nicknameTemplates');
        this.loadTemplateList('violationTemplatesList', 'violationTemplates');
    }

    loadTemplateList(containerId, storageKey) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const templates = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const sorted = Object.entries(templates).sort((a, b) => b[1] - a[1]);
        
        if (sorted.length === 0) {
            container.innerHTML = '<div class="template-item">Нет сохранённых шаблонов</div>';
            return;
        }
        
        container.innerHTML = sorted.map(([name, count]) => 
            `<div class="template-item">
                <span class="template-name">${name}</span>
                <span class="template-count">${count}</span>
            </div>`
        ).join('');
    }

    // Complaint generation
    generateComplaint(e) {
        e.preventDefault();
        
        const formData = this.getFormData();
        if (!this.validateForm(formData)) return;
        
        // Update templates
        this.updateTemplate(formData.yourNickname, 'nicknameTemplates');
        this.updateTemplate(formData.violation, 'violationTemplates');
        
        // Generate BB code
        const bbCode = this.generateBBCode(formData);
        
        // Show output
        document.getElementById('generatedOutput').value = bbCode;
        document.getElementById('outputSection').style.display = 'block';
        
        // Auto-copy to clipboard
        this.copyToClipboard(bbCode);
        
        // Confetti celebration!
        if (typeof confetti !== 'undefined') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#ff0000', '#00cc66', '#2196f3', '#ff69b4']
            });
        }
        
        this.playSound('success');
        
        // Save form state
        this.saveFormState();
        
        // Scroll to output
        document.getElementById('outputSection').scrollIntoView({ behavior: 'smooth' });

        // Show success overlay
        this.showSuccessOverlay();
    }

    getFormData() {
        return {
            yourNickname: document.getElementById('yourNickname').value.trim(),
            violatorNickname: document.getElementById('violatorNickname').value.trim(),
            violationDate: document.getElementById('violationDate').value,
            violation: document.getElementById('violation').value.trim(),
            affiliation: document.getElementById('affiliation').value,
            affiliationName: document.getElementById('affiliationName').value.trim(),
            evidence: document.getElementById('evidence').value.trim(),
            server: this.currentServer
        };
    }

    validateForm(formData) {
        const requiredFields = [
            { field: 'yourNickname', message: 'Введите ваш никнейм' },
            { field: 'violatorNickname', message: 'Введите никнейм нарушителя' },
            { field: 'violationDate', message: 'Выберите дату нарушения' },
            { field: 'violation', message: 'Опишите нарушение' },
            { field: 'evidence', message: 'Добавьте доказательства' }
        ];
        
        for (const { field, message } of requiredFields) {
            if (!formData[field]) {
                this.showError(field, message);
                return false;
            }
        }
        
        // Check affiliation name if needed
        if (formData.affiliation !== 'none' && formData.affiliation !== '' && !formData.affiliationName) {
            this.showError('affiliationName', 'Введите название организации/банды');
            return false;
        }
        
        return true;
    }

    showError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.add('error', 'shake');
            
            setTimeout(() => {
                field.classList.remove('shake');
            }, 600);
            
            // Remove existing error message
            const existingError = field.parentElement.querySelector('.error-message');
            if (existingError) existingError.remove();
            
            // Add error message
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
            field.parentElement.appendChild(errorDiv);
            
            // Remove error after 5 seconds
            setTimeout(() => {
                field.classList.remove('error');
                if (errorDiv.parentElement) errorDiv.remove();
            }, 5000);
            
            field.focus();
        }
        
        this.playSound('error');
    }

    // BB Code generation
    generateBBCode(formData) {
        // Get template based on server and affiliation
        const templateName = this.getMatchingTemplate(formData.server, formData.affiliation);
        const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates') || '{}');
        let template = savedTemplates[templateName] || this.getDefaultTemplate();
        
        // Format date
        const date = new Date(formData.violationDate);
        const formattedDate = date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Replace placeholders
        const replacements = {
            '{yourNickname}': formData.yourNickname,
            '{violatorNickname}': formData.violatorNickname,
            '{violation}': formData.violation,
            '{violationDate}': formattedDate,
            '{affiliationName}': formData.affiliationName || '',
            '{evidence}': formData.evidence
        };
        
        Object.entries(replacements).forEach(([placeholder, value]) => {
            template = template.replace(new RegExp(placeholder, 'g'), value);
        });
        
        return template;
    }

    getMatchingTemplate(server, affiliation) {
        const rules = JSON.parse(localStorage.getItem('templateRules') || '[]');
        
        for (const rule of rules) {
            const serverMatch = rule.server === 'any' || rule.server === server;
            const affiliationMatch = rule.affiliation === 'any' || rule.affiliation === affiliation;
            
            if (serverMatch && affiliationMatch) {
                return rule.templateName;
            }
        }
        
        return 'default';
    }

    getDefaultTemplate() {
        return `[CENTER][FONT=Book Antiqua][SIZE=6]
[IMG]https://i.imgur.com/fCg0qW9.png[/IMG]

[IMG]https://i.imgur.com/gYURVeT.png[/IMG]

Жалобщик: {yourNickname}
Нарушитель: {violatorNickname} 
Суть жалобы: {violation}
Дата нарушения: {violationDate}
Организация нарушителя: {affiliationName}
Доказательства: {evidence}

[IMG]https://i.imgur.com/gYURVeT.png[/IMG]
[/SIZE][/FONT][/CENTER]`;
    }

    // Output actions
    copyOutput() {
        const output = document.getElementById('generatedOutput');
        output.select();
        document.execCommand('copy');
        
        this.showSuccess('Код скопирован в буфер обмена!');
    }

    saveComplaint() {
        const formData = this.getFormData();
        const complaint = {
            ...formData,
            violationDateFormatted: new Date(formData.violationDate).toLocaleString('ru-RU'),
            timestamp: new Date().toISOString(),
            status: 'draft',
            templateUsed: this.getMatchingTemplate(formData.server, formData.affiliation)
        };
        
        // Get existing complaints
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        complaints.unshift(complaint);
        
        // Limit to 500 complaints
        if (complaints.length > 500) {
            complaints.splice(500);
        }
        
        localStorage.setItem('complaints', JSON.stringify(complaints));
        this.complaintsCache = null; // Invalidate cache
        this.showSuccess('Жалоба сохранена в историю!');
    }

    async openForumLink() {
        const affiliation = document.getElementById('affiliation').value;
        const server = this.currentServer;
        
        const links = {
            '1': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-сост-в-организациях.194/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-гос-структурах.195/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-криминальных-структурах.196/create-thread'
            },
            '12': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-состоящих-во-фракциях.534/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-гос-структурах.535/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-бандах.536/create-thread'
            }
        };
        
        const url = links[server]?.[affiliation];
        if (!url) {
            this.showError('affiliation', 'Выберите принадлежность нарушителя');
            return;
        }

        // Проверяем, есть ли данные для автоматической подачи
        const formData = this.getFormData();
        
        // Валидируем форму перед автоматической подачей
        if (!this.validateForm(formData)) {
            this.showNotification('Заполните все обязательные поля перед автоматической подачей', 'warning');
            return;
        }

        // Если есть данные, запускаем автоматическую подачу
        try {
            this.showNotification('🤖 Запускаем автоматическую подачу...', 'info');
            // Генерируем BB-код
            const bbCode = this.generateBBCode(formData);
            const customTitle = document.getElementById('submitTitle')?.value || 
                              `Жалоба на игрока ${formData.violatorNickname}`;

            // Создаем объект жалобы для автоматической подачи
            const complaint = {
                violatorNickname: formData.violatorNickname,
                violation: formData.violation,
                violationDate: formData.violationDate,
                affiliation: formData.affiliation,
                affiliationName: formData.affiliationName,
                server: formData.server || server,
                yourNickname: formData.yourNickname,
                evidence: formData.evidence
            };

            // Запускаем автоматическую подачу
            console.log('🚀 Запускаем автоматическую подачу через openForumLink');
            await this.submitComplaintToForum(complaint);
        } catch (error) {
            console.error('Ошибка при автоматической подаче:', error);
            // В случае ошибки просто открываем ссылку
            window.open(url, '_blank');
            this.showNotification('Ошибка автоматизации. Открыта ссылка для ручной подачи.', 'warning');
        }
    }

    // History functionality
    loadComplaints(searchQuery = '', affiliationFilter = 'all') {
        const container = document.getElementById('complaintsList');
        if (!container) return;
        
        // Cache complaints data
        if (!this.complaintsCache) {
            this.complaintsCache = JSON.parse(localStorage.getItem('complaints') || '[]');
        }
        
        const complaints = this.complaintsCache;
        let filtered = complaints;
        
        // Apply search filter
        if (searchQuery) {
            filtered = filtered.filter(complaint => 
                complaint.yourNickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                complaint.violatorNickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                complaint.violation.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        
        // Apply affiliation filter
        if (affiliationFilter && affiliationFilter !== 'all') {
            filtered = filtered.filter(complaint => complaint.affiliation === affiliationFilter);
        }
        
        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center">Нет сохранённых жалоб</div>';
            return;
        }
        
        container.innerHTML = filtered.map(complaint => this.createComplaintHTML(complaint)).join('');
        
        // Add event listeners for actions
        container.querySelectorAll('.complaint-action').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleComplaintAction(e));
        });
    }

    createComplaintHTML(complaint) {
        const status = this.getComplaintStatus(complaint.violationDate, complaint.status);
        const affiliationBadge = this.getAffiliationBadge(complaint.affiliation);
        
        return `
            <div class="complaint-item ${status.class}">
                <div class="complaint-header">
                    <div class="complaint-title">
                        <h3>${complaint.violatorNickname} → ${complaint.violation}</h3>
                        <span class="affiliation-badge ${this.getAffiliationClass(complaint.affiliation)}">${affiliationBadge}</span>
                    </div>
                    <div class="complaint-status ${status.class}">
                        ${status.text}
                        ${status.timeLeft ? `<br><small>${status.timeLeft}</small>` : ''}
                    </div>
                </div>
                <div class="complaint-details">
                    <div class="complaint-field">
                        <label>Жалобщик:</label>
                        <span>${complaint.yourNickname}</span>
                    </div>
                    <div class="complaint-field">
                        <label>Дата нарушения:</label>
                        <span>${complaint.violationDateFormatted}</span>
                    </div>
                    <div class="complaint-field">
                        <label>Сервер:</label>
                        <span>Сервер ${complaint.server}</span>
                    </div>
                    <div class="complaint-field">
                        <label>Принадлежность:</label>
                        <span>${complaint.affiliationName || 'Не указано'}</span>
                    </div>
                </div>
                <div class="complaint-actions">
                    <button class="btn btn-primary complaint-action" data-action="telegram" data-complaint='${JSON.stringify(complaint)}'>
                        <i class="fab fa-telegram-plane"></i> Отправить в Telegram
                    </button>
                    <button class="btn btn-success complaint-action" data-action="forum" data-complaint='${JSON.stringify(complaint)}'>
                        <i class="fas fa-external-link-alt"></i> На форум
                    </button>
                    <button class="btn btn-outline-success complaint-action" data-action="copy" data-complaint='${JSON.stringify(complaint)}'>
                        <i class="fas fa-code"></i> Копировать BB-код
                    </button>
                    <button class="btn btn-warning complaint-action" data-action="regenerate" data-complaint='${JSON.stringify(complaint)}'>
                        <i class="fas fa-redo"></i> Перегенерировать
                    </button>
                    <button class="btn btn-outline-danger complaint-action" data-action="delete" data-complaint='${JSON.stringify(complaint)}'>
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        `;
    }

    getComplaintStatus(violationDate, status) {
        if (status === 'published') return { class: 'complaint-published', text: 'Отправлена' };
        
        const now = Date.now();
        const violationTime = new Date(violationDate).getTime();
        const timeDiff = now - violationTime;
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        const minutesDiff = timeDiff / (1000 * 60);
        
        // Calculate remaining time
        const remainingMs = (72 * 60 * 60 * 1000) - timeDiff;
        
        if (hoursDiff > 72) return { class: 'complaint-expired', text: 'Просрочена' };
        
        const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const timeLeftText = `${remainingHours}ч ${remainingMinutes}м`;
        
        if (hoursDiff > 60) return { 
            class: 'complaint-60h', 
            text: '60+ часов', 
            timeLeft: `Осталось: ${timeLeftText}` 
        };
        if (hoursDiff > 48) return { 
            class: 'complaint-48h', 
            text: '48+ часов', 
            timeLeft: `Осталось: ${timeLeftText}` 
        };
        if (hoursDiff > 24) return { 
            class: 'complaint-24h', 
            text: '24+ часов', 
            timeLeft: `Осталось: ${timeLeftText}` 
        };
        
        return { 
            class: 'complaint-new', 
            text: 'Новая',
            timeLeft: `Осталось: ${timeLeftText}`
        };
    }

    handleComplaintAction(e) {
        const action = e.target.closest('.complaint-action').dataset.action;
        const complaint = JSON.parse(e.target.closest('.complaint-action').dataset.complaint);
        
        switch (action) {
            case 'regenerate':
                this.regenerateComplaint(complaint);
                break;
            case 'copy':
                this.copyComplaintCode(complaint);
                break;
            case 'forum':
                this.openComplaintForum(complaint);
                break;
            case 'delete':
                this.deleteComplaint(complaint);
                break;
            case 'telegram':
                this.sendComplaintToTelegram(complaint);
                break;
        }
    }

    regenerateComplaint(complaint) {
        // Fill form with complaint data
        Object.keys(complaint).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                element.value = complaint[key];
            }
        });
        
        // Handle affiliation display
        if (complaint.affiliation && complaint.affiliation !== 'none') {
            document.getElementById('affiliationNameGroup').style.display = 'block';
        }
        
        // Switch to form tab
        this.switchTab('form');
        this.selectServer(complaint.server);
        this.updateProgressBar();
    }

    copyComplaintCode(complaint) {
        const bbCode = this.generateBBCode(complaint);
        navigator.clipboard.writeText(bbCode).then(() => {
            this.showSuccess('Код скопирован в буфер обмена!');
        });
    }
    
    async sendComplaintToTelegram(complaint) {
        console.log('Отправка жалобы в Telegram:', complaint.violatorNickname);
        
        // Проверяем, что жалоба еще не отправлена
        if (complaint.telegramSent) {
            this.showNotification('Эта жалоба уже отправлена в Telegram', 'warning');
            return;
        }
        
        if (!window.telegramIntegration) {
            this.showNotification('Настройте Telegram во вкладке Telegram', 'warning');
            return;
        }
        
        const bbCode = this.generateBBCode(complaint);
        
        try {
            await window.telegramIntegration.sendMessage(bbCode);
            // Отмечаем жалобу как отправленную
            this.markComplaintAsTelegramSent(complaint);
            this.showSuccess(`Жалоба на ${complaint.violatorNickname} отправлена в Telegram! 🚀`);
            this.playSound('success');
        } catch (error) {
            console.error('Telegram ошибка:', error);
            this.showNotification('Ошибка отправки в Telegram. Проверьте настройки.', 'error');
        }
    }
    
    markComplaintAsTelegramSent(sentComplaint) {
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const updatedComplaints = complaints.map(complaint => {
            if (complaint.timestamp === sentComplaint.timestamp) {
                return { ...complaint, telegramSent: true, telegramSentAt: Date.now() };
            }
            return complaint;
        });
        
        localStorage.setItem('complaints', JSON.stringify(updatedComplaints));
        this.complaintsCache = null; // Invalidate cache
        this.loadComplaints(); // Перезагружаем список
    }
    
    sendAllHistoryToTelegram() {
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const unsentComplaints = complaints.filter(complaint => !complaint.telegramSent);
        
        if (unsentComplaints.length === 0) {
            this.showNotification('Все жалобы уже отправлены в Telegram', 'info');
            return;
        }
        
        if (!window.telegramIntegration) {
            this.showNotification('Настройте Telegram перед отправкой', 'warning');
            return;
        }
        
        if (!confirm(`Отправить ${unsentComplaints.length} неотправленных жалоб в Telegram?`)) {
            return;
        }
        
        this.showNotification(`Начинаем отправку ${unsentComplaints.length} жалоб...`, 'info');
        
        let sentCount = 0;
        let errorCount = 0;
        
        const sendNext = (index) => {
            if (index >= unsentComplaints.length) {
                // Завершаем отправку
                this.showSuccess(`Отправка завершена! Успешно: ${sentCount}, Ошибок: ${errorCount}`);
                this.playSound('success');
                return;
            }
            
            const complaint = unsentComplaints[index];
            const bbCode = this.generateBBCode(complaint);
            
            window.telegramIntegration.sendMessage(bbCode)
                .then(() => {
                    sentCount++;
                    this.markComplaintAsTelegramSent(complaint);
                    console.log(`✅ Отправлена жалоба ${index + 1}/${unsentComplaints.length}: ${complaint.violatorNickname}`);
                    
                    // Пауза 2 секунды между отправками
                    setTimeout(() => sendNext(index + 1), 2000);
                })
                .catch(error => {
                    errorCount++;
                    console.error(`❌ Ошибка отправки жалобы ${index + 1}/${unsentComplaints.length}:`, error);
                    
                    // Продолжаем несмотря на ошибку
                    setTimeout(() => sendNext(index + 1), 1000);
                });
        };
        
        // Начинаем отправку
        sendNext(0);
    }

    deleteComplaint(complaintToDelete) {
        if (!confirm('Вы уверены, что хотите удалить эту жалобу?')) return;
        
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const filtered = complaints.filter(complaint => 
            complaint.timestamp !== complaintToDelete.timestamp
        );
        
        localStorage.setItem('complaints', JSON.stringify(filtered));
        this.complaintsCache = null; // Invalidate cache
        this.loadComplaints();
        this.showSuccess('Жалоба удалена!');
    }

    searchHistory(query) {
        const filter = document.getElementById('affiliationFilter')?.value || 'all';
        this.loadComplaints(query, filter);
    }
    
    filterHistory(filter) {
        const query = document.getElementById('historySearch')?.value || '';
        this.loadComplaints(query, filter);
    }

    // Template configuration
    loadTemplateConfig() {
        const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates') || '{}');
        const templateName = document.getElementById('templateName');
        const templateContent = document.getElementById('templateContent');
        
        if (savedTemplates.default) {
            templateContent.value = savedTemplates.default;
        } else {
            templateContent.value = this.getDefaultTemplate();
        }

        // sync editor
        this.setTemplateEditorValue(templateContent.value);
    }

    saveTemplate() {
        const name = document.getElementById('templateName').value.trim() || 'default';
        const content = this.getTemplateEditorValue().trim();
        
        if (!content) {
            this.showError('templateContent', 'Введите содержимое шаблона');
            return;
        }
        
        const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates') || '{}');
        savedTemplates[name] = content;
        localStorage.setItem('savedTemplates', JSON.stringify(savedTemplates));
        
        this.showSuccess('Шаблон сохранён!');
    }

    loadTemplate() {
        const name = document.getElementById('templateName').value.trim() || 'default';
        const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates') || '{}');
        
        if (savedTemplates[name]) {
            this.setTemplateEditorValue(savedTemplates[name]);
            this.showSuccess('Шаблон загружен!');
        } else {
            this.showError('templateName', 'Шаблон не найден');
        }
    }

    // Template editor helpers
    initTemplateEditor() {
        const editor = document.getElementById('templateEditorInput');
        const textarea = document.getElementById('templateContent');
        if (!editor || !textarea) return;

        // Toolbar buttons
        document.querySelectorAll('#templateEditor .editor-toolbar button[data-bb]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const bb = btn.dataset.bb;
                // Color button is handled separately in initColorPalette
                if (bb === 'color') return;
                const size = document.getElementById('bbSize')?.value;
                const font = document.getElementById('bbFont')?.value;
                this.applyEditorFormatting(bb, { size, font });
            });
        });

        document.getElementById('bbSize')?.addEventListener('change', (e) => {
            if (e.target.value) this.applyEditorFormatting('size', { size: e.target.value });
        });
        document.getElementById('bbFont')?.addEventListener('change', (e) => {
            if (e.target.value) this.applyEditorFormatting('font', { font: e.target.value });
        });

        // Initialize color palette
        this.initColorPalette();

        document.getElementById('rawToggle')?.addEventListener('click', () => this.toggleRawEditor());
        document.getElementById('previewTemplate')?.addEventListener('click', () => this.previewTemplate());
    }

    initColorPalette() {
        const colorBtn = document.getElementById('colorBtn');
        const colorPalette = document.getElementById('colorPalette');
        const colorGrid = document.getElementById('colorGrid');
        
        if (!colorBtn || !colorPalette || !colorGrid) return;

        // 80 colors in 8 rows x 10 columns
        const colors = [
            // Row 1: Light pastels
            '#FFFFFF', '#F5F5F5', '#E0E0E0', '#BDBDBD', '#9E9E9E', '#757575', '#616161', '#424242', '#212121', '#000000',
            // Row 2: Pastels
            '#FFEBEE', '#FFF3E0', '#FFF9C4', '#F1F8E9', '#E0F2F1', '#E0F7FA', '#E3F2FD', '#EDE7F6', '#FCE4EC', '#F3E5F5',
            // Row 3: Bright vibrant
            '#FF0000', '#FF6F00', '#FFEB3B', '#8BC34A', '#4CAF50', '#00BCD4', '#2196F3', '#9C27B0', '#E91E63', '#F50057',
            // Row 4: Medium saturated
            '#C62828', '#E65100', '#F57F17', '#558B2F', '#2E7D32', '#00838F', '#1565C0', '#6A1B9A', '#C2185B', '#C51162',
            // Row 5: Deeper colors
            '#B71C1C', '#BF360C', '#F57C00', '#33691E', '#1B5E20', '#006064', '#0D47A1', '#4A148C', '#880E4F', '#AD1457',
            // Row 6: Darker shades
            '#8B0000', '#8B4513', '#8B6914', '#2F4F2F', '#0F5132', '#004D40', '#000080', '#2D1B69', '#4B0082', '#6A0DAD',
            // Row 7: Very dark
            '#4B0000', '#654321', '#6B4423', '#1C3A1C', '#0A2E0A', '#001F1F', '#000040', '#1A0D3D', '#2D0042', '#4A0042',
            // Row 8: Almost black with hints
            '#1A0000', '#2F1B14', '#3D2817', '#0F1F0F', '#051405', '#000F0F', '#000020', '#0D0519', '#1A0019', '#2D0019'
        ];

        colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.dataset.color = color;
            swatch.addEventListener('click', () => {
                this.selectColor(color);
                colorPalette.style.display = 'none';
            });
            colorGrid.appendChild(swatch);
        });

        // Color button click
        colorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            colorPalette.style.display = colorPalette.style.display === 'none' ? 'block' : 'none';
        });

        // Close palette on outside click
        document.addEventListener('click', (e) => {
            if (!colorPalette.contains(e.target) && e.target !== colorBtn) {
                colorPalette.style.display = 'none';
            }
        });

        // "Отсутствует" option
        const colorNone = colorPalette.querySelector('.color-none');
        if (colorNone) {
            colorNone.addEventListener('click', () => {
                this.selectColor('');
                colorPalette.style.display = 'none';
            });
        }
    }

    selectColor(color) {
        this.selectedColor = color;
        this.applyEditorFormatting('color', { color: color });
    }

    getTemplateEditorValue() {
        const editor = document.getElementById('templateEditorInput');
        const textarea = document.getElementById('templateContent');
        if (!editor || !textarea) return '';

        // If raw mode, return textarea value
        if (textarea.style.display !== 'none') {
            return textarea.value;
        }

        // Convert visual HTML to BB-code
        return this.htmlToBbCode(editor.innerHTML);
    }

    setTemplateEditorValue(value) {
        const editor = document.getElementById('templateEditorInput');
        const textarea = document.getElementById('templateContent');
        if (!editor || !textarea) return;

        // If raw mode, set textarea
        if (textarea.style.display !== 'none') {
            textarea.value = value || '';
            return;
        }

        // Convert BB-code to HTML for visual display
        editor.innerHTML = this.bbCodeToHtml(value || '');
    }

    applyEditorFormatting(type, options = {}) {
        const editor = document.getElementById('templateEditorInput');
        const textarea = document.getElementById('templateContent');
        const isRaw = textarea?.style.display !== 'none';

        // Raw mode: insert BB tags
        if (isRaw && textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = textarea.value.substring(start, end) || 'текст';
            const before = textarea.value.substring(0, start);
            const after = textarea.value.substring(end);
            const wrapped = this.wrapBbCode(selected, type, options);
            textarea.value = before + wrapped + after;
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = before.length + wrapped.length;
            return;
        }

        // Visual mode: use execCommand or manual formatting
        if (!editor) return;
        editor.focus();

        switch (type) {
            case 'b':
                document.execCommand('bold', false, null);
                break;
            case 'i':
                document.execCommand('italic', false, null);
                break;
            case 'u':
                document.execCommand('underline', false, null);
                break;
            case 'color':
                const colorToApply = options.color || this.selectedColor || '#000000';
                if (colorToApply) {
                    document.execCommand('foreColor', false, colorToApply);
                }
                break;
            case 'size':
                if (options.size) {
                    const sizeMap = {1:'1',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7'};
                    const fontSize = sizeMap[options.size] || '3';
                    document.execCommand('fontSize', false, fontSize);
                }
                break;
            case 'font':
                if (options.font) {
                    document.execCommand('fontName', false, options.font);
                }
                break;
            case 'url': {
                const url = prompt('Введите ссылку:', 'https://');
                if (url) {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const selectedText = range.toString() || 'ссылка';
                        const link = document.createElement('a');
                        link.href = url;
                        link.textContent = selectedText;
                        link.style.color = '#ff0000';
                        link.style.textDecoration = 'underline';
                        range.deleteContents();
                        range.insertNode(link);
                    }
                }
                break;
            }
            case 'unlink': {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const link = range.commonAncestorContainer.closest?.('a') || 
                                 range.startContainer.parentElement?.closest('a');
                    if (link) {
                        const text = document.createTextNode(link.textContent);
                        link.parentNode.replaceChild(text, link);
                    }
                }
                break;
            }
            case 'align-left':
                document.execCommand('justifyLeft', false, null);
                break;
            case 'align-center':
                document.execCommand('justifyCenter', false, null);
                break;
            case 'align-right':
                document.execCommand('justifyRight', false, null);
                break;
            case 'ul':
                document.execCommand('insertUnorderedList', false, null);
                break;
            case 'ol':
                document.execCommand('insertOrderedList', false, null);
                break;
            case 'indent':
                document.execCommand('indent', false, null);
                break;
            case 'outdent':
                document.execCommand('outdent', false, null);
                break;
            case 'undo':
                document.execCommand('undo', false, null);
                break;
            case 'redo':
                document.execCommand('redo', false, null);
                break;
            case 'img': {
                const url = prompt('Ссылка на изображение:', 'https://');
                if (url) {
                    const img = document.createElement('img');
                    img.src = url;
                    img.style.maxWidth = '100%';
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        range.insertNode(img);
                    }
                }
                break;
            }
        }
    }

    wrapBbCode(text, type, options = {}) {
        let wrapped = text;
        switch (type) {
            case 'b':
                wrapped = `[B]${text}[/B]`;
                break;
            case 'i':
                wrapped = `[I]${text}[/I]`;
                break;
            case 'u':
                wrapped = `[U]${text}[/U]`;
                break;
            case 'size':
                if (options.size) wrapped = `[SIZE=${options.size}]${text}[/SIZE]`;
                break;
            case 'font':
                if (options.font) wrapped = `[FONT=${options.font}]${text}[/FONT]`;
                break;
            case 'color':
                const colorToUse = options.color || this.selectedColor;
                if (colorToUse) wrapped = `[COLOR=${colorToUse}]${text}[/COLOR]`;
                break;
            case 'url': {
                const url = prompt('Введите ссылку:', 'https://');
                if (url) wrapped = `[URL='${url}']${text}[/URL]`;
                break;
            }
            case 'unlink': {
                wrapped = text.replace(/\[URL='[^']*'\]/gi, '').replace(/\[\/URL\]/gi, '');
                break;
            }
            case 'img': {
                const url = prompt('Ссылка на изображение:', 'https://');
                if (url) wrapped = `[IMG]${url}[/IMG]`;
                break;
            }
            case 'align-left':
                wrapped = text.replace(/\[CENTER\]/gi, '').replace(/\[\/CENTER\]/gi, '')
                             .replace(/\[RIGHT\]/gi, '').replace(/\[\/RIGHT\]/gi, '');
                break;
            case 'align-center':
                wrapped = `[CENTER]${text}[/CENTER]`;
                break;
            case 'align-right':
                wrapped = `[RIGHT]${text}[/RIGHT]`;
                break;
            case 'ul': {
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                wrapped = `[LIST]\n${lines.map(l => `[*]${l}`).join('\n')}\n[/LIST]`;
                break;
            }
            case 'ol': {
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                wrapped = `[LIST=1]\n${lines.map(l => `[*]${l}`).join('\n')}\n[/LIST]`;
                break;
            }
            case 'indent':
                wrapped = `[INDENT]${text}[/INDENT]`;
                break;
            case 'outdent':
                wrapped = text.replace(/^\[INDENT\](.*)\[\/INDENT\]$/is, '$1');
                break;
        }
        return wrapped;
    }

    htmlToBbCode(html) {
        if (!html) return '';
        let bb = html;

        // Convert links
        bb = bb.replace(/<a[^>]*href=['"]([^'"]+)['"][^>]*>(.*?)<\/a>/gis, (match, url, text) => {
            return `[URL='${url}']${text}[/URL]`;
        });

        // Convert images
        bb = bb.replace(/<img[^>]*src=['"]([^'"]+)['"][^>]*>/gis, (match, src) => {
            return `[IMG]${src}[/IMG]`;
        });

        // Convert formatting tags
        bb = bb.replace(/<strong[^>]*>(.*?)<\/strong>/gis, '[B]$1[/B]');
        bb = bb.replace(/<b[^>]*>(.*?)<\/b>/gis, '[B]$1[/B]');
        bb = bb.replace(/<em[^>]*>(.*?)<\/em>/gis, '[I]$1[/I]');
        bb = bb.replace(/<i[^>]*>(.*?)<\/i>/gis, '[I]$1[/I]');
        bb = bb.replace(/<u[^>]*>(.*?)<\/u>/gis, '[U]$1[/U]');

        // Convert font size
        bb = bb.replace(/<font[^>]*size=['"]?(\d)['"]?[^>]*>(.*?)<\/font>/gis, (match, size, text) => {
            return `[SIZE=${size}]${text}[/SIZE]`;
        });
        bb = bb.replace(/<span[^>]*style=['"][^'"]*font-size:\s*(\d+)px[^'"]*['"][^>]*>(.*?)<\/span>/gis, (match, px, text) => {
            const sizeMap = {'10px':1,'12px':2,'14px':3,'16px':4,'18px':5,'20px':6,'22px':7};
            const size = sizeMap[px + 'px'] || 3;
            return `[SIZE=${size}]${text}[/SIZE]`;
        });

        // Convert font family
        bb = bb.replace(/<font[^>]*face=['"]([^'"]+)['"][^>]*>(.*?)<\/font>/gis, (match, font, text) => {
            return `[FONT=${font}]${text}[/FONT]`;
        });
        bb = bb.replace(/<span[^>]*style=['"][^'"]*font-family:\s*([^;'"]+)[^'"]*['"][^>]*>(.*?)<\/span>/gis, (match, font, text) => {
            const cleanFont = font.replace(/['"]/g, '').trim();
            return `[FONT=${cleanFont}]${text}[/FONT]`;
        });

        // Convert color
        bb = bb.replace(/<font[^>]*color=['"]([^'"]+)['"][^>]*>(.*?)<\/font>/gis, (match, color, text) => {
            return `[COLOR=${color}]${text}[/COLOR]`;
        });
        bb = bb.replace(/<span[^>]*style=['"][^'"]*color:\s*([^;'"]+)[^'"]*['"][^>]*>(.*?)<\/span>/gis, (match, color, text) => {
            return `[COLOR=${color.trim()}]${text}[/COLOR]`;
        });

        // Convert alignment
        bb = bb.replace(/<div[^>]*style=['"][^'"]*text-align:\s*center[^'"]*['"][^>]*>(.*?)<\/div>/gis, '[CENTER]$1[/CENTER]');
        bb = bb.replace(/<div[^>]*align=['"]?center['"]?[^>]*>(.*?)<\/div>/gis, '[CENTER]$1[/CENTER]');
        bb = bb.replace(/<center[^>]*>(.*?)<\/center>/gis, '[CENTER]$1[/CENTER]');
        bb = bb.replace(/<div[^>]*style=['"][^'"]*text-align:\s*right[^'"]*['"][^>]*>(.*?)<\/div>/gis, '[RIGHT]$1[/RIGHT]');
        bb = bb.replace(/<div[^>]*align=['"]?right['"]?[^>]*>(.*?)<\/div>/gis, '[RIGHT]$1[/RIGHT]');

        // Convert lists
        bb = bb.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
            const items = content.match(/<li[^>]*>(.*?)<\/li>/gis) || [];
            const bbItems = items.map(item => {
                const text = item.replace(/<li[^>]*>|<\/li>/gi, '').trim();
                return `[*]${this.htmlToBbCode(text)}`;
            }).join('\n');
            return `[LIST]\n${bbItems}\n[/LIST]`;
        });
        bb = bb.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
            const items = content.match(/<li[^>]*>(.*?)<\/li>/gis) || [];
            const bbItems = items.map(item => {
                const text = item.replace(/<li[^>]*>|<\/li>/gi, '').trim();
                return `[*]${this.htmlToBbCode(text)}`;
            }).join('\n');
            return `[LIST=1]\n${bbItems}\n[/LIST]`;
        });

        // Convert line breaks
        bb = bb.replace(/<br\s*\/?>/gi, '\n');
        bb = bb.replace(/<\/p>/gi, '\n');
        bb = bb.replace(/<p[^>]*>/gi, '');

        // Remove remaining HTML tags
        bb = bb.replace(/<[^>]+>/g, '');

        // Decode HTML entities
        const div = document.createElement('div');
        div.innerHTML = bb;
        bb = div.textContent || div.innerText || '';

        return bb.trim();
    }

    bbCodeToHtml(bb) {
        if (!bb) return '';
        let html = bb;

        // Escape HTML
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Convert BB tags to HTML
        html = html.replace(/\[B\](.*?)\[\/B\]/gis, '<strong>$1</strong>');
        html = html.replace(/\[I\](.*?)\[\/I\]/gis, '<em>$1</em>');
        html = html.replace(/\[U\](.*?)\[\/U\]/gis, '<u>$1</u>');

        // Size
        const sizeMap = {1:'10px',2:'12px',3:'14px',4:'16px',5:'18px',6:'20px',7:'22px'};
        html = html.replace(/\[SIZE=(\d)\](.*?)\[\/SIZE\]/gis, (match, size, text) => {
            return `<span style="font-size:${sizeMap[size]||'14px'}">${text}</span>`;
        });

        // Font
        html = html.replace(/\[FONT=([^\]]+)\](.*?)\[\/FONT\]/gis, (match, font, text) => {
            return `<span style="font-family:${font}">${text}</span>`;
        });

        // Color
        html = html.replace(/\[COLOR=([^\]]+)\](.*?)\[\/COLOR\]/gis, (match, color, text) => {
            return `<span style="color:${color}">${text}</span>`;
        });

        // URL
        html = html.replace(/\[URL='([^']+)'\](.*?)\[\/URL\]/gis, '<a href="$1" style="color:#ff0000;text-decoration:underline">$2</a>');
        html = html.replace(/\[URL=([^\]]+)\](.*?)\[\/URL\]/gis, '<a href="$1" style="color:#ff0000;text-decoration:underline">$2</a>');

        // IMG
        html = html.replace(/\[IMG\](.*?)\[\/IMG\]/gis, '<img src="$1" style="max-width:100%">');

        // Alignment
        html = html.replace(/\[CENTER\](.*?)\[\/CENTER\]/gis, '<div style="text-align:center">$1</div>');
        html = html.replace(/\[RIGHT\](.*?)\[\/RIGHT\]/gis, '<div style="text-align:right">$1</div>');

        // Lists
        html = html.replace(/\[LIST\](.*?)\[\/LIST\]/gis, (match, content) => {
            const items = content.match(/\[\*\](.*?)(?=\[\*\]|$)/gis) || [];
            const liItems = items.map(item => {
                const text = item.replace(/\[\*\]/, '').trim();
                return `<li>${this.bbCodeToHtml(text)}</li>`;
            }).join('');
            return `<ul>${liItems}</ul>`;
        });
        html = html.replace(/\[LIST=1\](.*?)\[\/LIST\]/gis, (match, content) => {
            const items = content.match(/\[\*\](.*?)(?=\[\*\]|$)/gis) || [];
            const liItems = items.map(item => {
                const text = item.replace(/\[\*\]/, '').trim();
                return `<li>${this.bbCodeToHtml(text)}</li>`;
            }).join('');
            return `<ol>${liItems}</ol>`;
        });

        // Indent
        html = html.replace(/\[INDENT\](.*?)\[\/INDENT\]/gis, '<div style="margin-left:20px">$1</div>');

        // Line breaks
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    toggleRawEditor() {
        const editor = document.getElementById('templateEditorInput');
        const textarea = document.getElementById('templateContent');
        const toggle = document.getElementById('rawToggle');
        if (!editor || !textarea) return;

        const rawVisible = textarea.style.display !== 'none';
        if (rawVisible) {
            // Switch to visual: convert BB to HTML
            const bbCode = textarea.value;
            editor.innerHTML = this.bbCodeToHtml(bbCode);
            textarea.style.display = 'none';
            editor.style.display = 'block';
            toggle.textContent = 'Упрощённый';
        } else {
            // Switch to raw: convert HTML to BB
            const bbCode = this.htmlToBbCode(editor.innerHTML);
            textarea.value = bbCode;
            textarea.style.display = 'block';
            editor.style.display = 'none';
            toggle.textContent = 'Визуальный';
        }
    }

    previewTemplate() {
        const preview = document.getElementById('templatePreview');
        if (!preview) return;
        const bb = this.getTemplateEditorValue();
        const html = this.bbToHtml(bb);
        preview.innerHTML = html;
        preview.style.display = 'block';
    }

    bbToHtml(bb) {
        // Use the same conversion function
        return this.bbCodeToHtml(bb);
    }

    // Telegram configuration
    loadTelegramConfig() {
        const config = JSON.parse(localStorage.getItem('telegramConfig') || '{}');
        
        if (config.botToken) document.getElementById('telegramToken').value = config.botToken;
        if (config.chatId) document.getElementById('telegramChatId').value = config.chatId;
        if (config.telegramTemplate) {
            document.getElementById('telegramTemplate').value = config.telegramTemplate;
        } else {
            document.getElementById('telegramTemplate').value = this.getDefaultTelegramTemplate();
        }
    }

    saveTelegramConfig() {
        const config = {
            botToken: document.getElementById('telegramToken').value.trim(),
            chatId: document.getElementById('telegramChatId').value.trim(),
            telegramTemplate: document.getElementById('telegramTemplate').value.trim()
        };
        
        localStorage.setItem('telegramConfig', JSON.stringify(config));
        this.showSuccess('Настройки Telegram сохранены!');
    }

    testTelegram() {
        const config = JSON.parse(localStorage.getItem('telegramConfig') || '{}');
        
        if (!config.botToken || !config.chatId) {
            this.showError('telegramToken', 'Заполните токен и Chat ID');
            return;
        }
        
        // Create test message
        const testMessage = config.telegramTemplate.replace(/\\n/g, '\n')
            .replace('{yourNickname}', 'TestUser')
            .replace('{violatorNickname}', 'TestViolator')
            .replace('{violation}', 'Тест интеграции')
            .replace('{violationDate}', new Date().toLocaleString('ru-RU'))
            .replace('{affiliationName}', 'Тестовая организация')
            .replace('{evidence}', 'https://example.com/test.jpg');
        
        // Send via TelegramIntegration
        if (window.telegramIntegration) {
            window.telegramIntegration.sendMessage(testMessage)
                .then(() => this.showSuccess('Тестовое сообщение отправлено!'))
                .catch(err => this.showError('telegramToken', `Ошибка отправки: ${err.message}`));
        }
    }

    loadTelegramStats() {
        const stats = JSON.parse(localStorage.getItem('telegramStats') || '{ "sent": 0, "success": 0, "failed": 0 }');
        
        document.getElementById('telegramSent').textContent = stats.sent;
        document.getElementById('telegramSuccess').textContent = stats.success;
        document.getElementById('telegramFailed').textContent = stats.failed;
    }

    getDefaultTelegramTemplate() {
        return `🚨 Новая жалоба\\n\\n👤 Жалобщик: {yourNickname}\\n🎯 Нарушитель: {violatorNickname}\\n⚠️ Нарушение: {violation}\\n📅 Дата: {violationDate}\\n🏢 Организация: {affiliationName}\\n📸 Доказательства: {evidence}`;
    }
    
    // Template rules management
    addTemplateRule() {
        const server = document.getElementById('ruleServer').value;
        const affiliation = document.getElementById('ruleAffiliation').value;
        const templateName = document.getElementById('ruleTemplate').value.trim();
        
        if (!templateName) {
            this.showError('ruleTemplate', 'Введите название шаблона');
            return;
        }
        
        const rules = JSON.parse(localStorage.getItem('templateRules') || '[]');
        const newRule = {
            id: Date.now().toString(),
            server,
            affiliation,
            templateName
        };
        
        rules.push(newRule);
        localStorage.setItem('templateRules', JSON.stringify(rules));
        
        // Clear form
        document.getElementById('ruleServer').value = 'any';
        document.getElementById('ruleAffiliation').value = 'any';
        document.getElementById('ruleTemplate').value = '';
        
        this.loadTemplateRules();
        this.showSuccess('Правило добавлено!');
    }
    
    loadTemplateRules() {
        const container = document.getElementById('rulesList');
        if (!container) return;
        
        const rules = JSON.parse(localStorage.getItem('templateRules') || '[]');
        
        if (rules.length === 0) {
            container.innerHTML = '<div class="text-center">Нет созданных правил</div>';
            return;
        }
        
        container.innerHTML = rules.map(rule => 
            `<div class="rule-item">
                <div class="rule-info">
                    <strong>Шаблон:</strong> ${rule.templateName}<br>
                    <small>
                        <strong>Сервер:</strong> ${this.getRuleServerName(rule.server)} | 
                        <strong>Тип:</strong> ${this.getRuleAffiliationName(rule.affiliation)}
                    </small>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="complaintGenerator.deleteTemplateRule('${rule.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`
        ).join('');
    }
    
    deleteTemplateRule(ruleId) {
        const rules = JSON.parse(localStorage.getItem('templateRules') || '[]');
        const filtered = rules.filter(rule => rule.id !== ruleId);
        localStorage.setItem('templateRules', JSON.stringify(filtered));
        
        this.loadTemplateRules();
        this.showSuccess('Правило удалено!');
    }
    
    getRuleServerName(server) {
        const names = {
            'any': 'Любой',
            '1': 'Сервер 1',
            '12': 'Сервер 12'
        };
        return names[server] || server;
    }
    
    getRuleAffiliationName(affiliation) {
        const names = {
            'any': 'Любая',
            'none': 'Не состоит',
            'org': 'Организация',
            'gang': 'Банда/Криминальная'
        };
        return names[affiliation] || affiliation;
    }
    
    // Affiliation badge methods
    getAffiliationBadge(affiliation) {
        const badges = {
            'none': 'Не сост',
            'org': 'Организация',
            'gang': 'Банда'
        };
        return badges[affiliation] || 'Не указано';
    }
    
    getAffiliationClass(affiliation) {
        const classes = {
            'none': 'badge-none',
            'org': 'badge-org',
            'gang': 'badge-gang'
        };
        return classes[affiliation] || 'badge-default';
    }
    
    // Forum link for complaints
    openComplaintForum(complaint) {
        const links = {
            '1': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-сост-в-организациях.194/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-гос-структурах.195/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-криминальных-структурах.196/create-thread'
            },
            '12': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-состоящих-во-фракциях.534/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-гос-структурах.535/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-бандах.536/create-thread'
            }
        };
        
        const url = links[complaint.server]?.[complaint.affiliation];
        if (url) {
            window.open(url, '_blank');
        } else {
            this.showError('', 'Не удалось определить ссылку на форум');
        }
    }
    
    // Date time input enhancement
    setupDateTimeInput() {
        const dateTimeInput = document.getElementById('violationDate');
        if (dateTimeInput) {
            dateTimeInput.style.cursor = 'pointer';
            dateTimeInput.addEventListener('click', () => {
                dateTimeInput.showPicker();
            });
        }
    }
    
    // Enhanced clipboard functionality
    copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                this.showSuccess('BB-код скопирован в буфер обмена!');
            }).catch(() => {
                this.fallbackCopyToClipboard(text);
            });
        } else {
            this.fallbackCopyToClipboard(text);
        }
    }
    
    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            this.showSuccess('BB-код скопирован в буфер обмена!');
        } catch (err) {
            this.showError('', 'Ошибка копирования');
        }
        document.body.removeChild(textArea);
    }
    
    // Statistics functionality
    loadStatistics() {
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const nicknameTemplates = JSON.parse(localStorage.getItem('nicknameTemplates') || '{}');
        const violationTemplates = JSON.parse(localStorage.getItem('violationTemplates') || '{}');
        const telegramStats = JSON.parse(localStorage.getItem('telegramStats') || '{ "sent": 0, "success": 0, "failed": 0 }');
        
        // Main stats
        this.updateMainStats(complaints);
        
        // Charts
        this.updateAffiliationChart(complaints);
        this.updateServerChart(complaints);
        
        // Tables
        this.updateTopViolations(complaints);
        this.updateTimeHeatmap(complaints);
        
        // Usage stats
        this.updateTemplateUsage(nicknameTemplates, violationTemplates);
        this.updateTelegramUsage(telegramStats);
    }
    
    clearHistory() {
        if (!confirm('Вы уверены, что хотите очистить всю историю? Это действие нельзя отменить.')) {
            return;
        }
        
        // Clear complaints
        this.complaints = [];
        this.complaintsCache = null; // Invalidate cache
        localStorage.setItem('complaints', JSON.stringify([]));
        
        // Clear templates
        localStorage.setItem('nicknameTemplates', JSON.stringify({}));
        localStorage.setItem('violationTemplates', JSON.stringify({}));
        
        // Clear telegram stats
        localStorage.setItem('telegramStats', JSON.stringify({ sent: 0, success: 0, failed: 0 }));
        
        // Reload statistics
        this.loadStatistics();
        
        // Reload history if on history tab
        if (this.currentTab === 'history') {
            this.renderHistory();
        }
        
        this.showSuccess('История очищена!');
    }
    
    updateMainStats(complaints) {
        const now = Date.now();
        const activeComplaints = complaints.filter(c => {
            const hoursDiff = (now - new Date(c.violationDate).getTime()) / (1000 * 60 * 60);
            return hoursDiff <= 72;
        });
        const expiredComplaints = complaints.filter(c => {
            const hoursDiff = (now - new Date(c.violationDate).getTime()) / (1000 * 60 * 60);
            return hoursDiff > 72;
        });
        const successRate = complaints.length > 0 ? Math.round((activeComplaints.length / complaints.length) * 100) : 0;
        
        document.getElementById('totalComplaints').textContent = complaints.length;
        document.getElementById('activeComplaints').textContent = activeComplaints.length;
        document.getElementById('expiredComplaints').textContent = expiredComplaints.length;
        document.getElementById('successRate').textContent = `${successRate}%`;
    }
    
    updateAffiliationChart(complaints) {
        const affiliationCounts = {
            'none': 0,
            'org': 0,
            'gang': 0
        };
        
        complaints.forEach(c => {
            affiliationCounts[c.affiliation] = (affiliationCounts[c.affiliation] || 0) + 1;
        });
        
        const total = complaints.length;
        const chartContainer = document.getElementById('affiliationChart');
        const legendContainer = document.getElementById('affiliationLegend');
        
        if (total === 0) {
            chartContainer.innerHTML = '<div class="no-data">Нет данных</div>';
            legendContainer.innerHTML = '';
            return;
        }
        
        // Simple pie chart with CSS
        const colors = ['#6c757d', '#007bff', '#dc3545'];
        const labels = ['Не сост', 'Организации', 'Банды'];
        const values = [affiliationCounts.none, affiliationCounts.org, affiliationCounts.gang];
        
        let cumulativePercentage = 0;
        const segments = values.map((value, index) => {
            const percentage = (value / total) * 100;
            const segment = {
                percentage,
                color: colors[index],
                label: labels[index],
                count: value,
                startAngle: cumulativePercentage * 3.6,
                endAngle: (cumulativePercentage + percentage) * 3.6
            };
            cumulativePercentage += percentage;
            return segment;
        }).filter(s => s.count > 0);
        
        // Create pie chart with conic-gradient
        const gradientStops = segments.map((segment, index) => {
            const prevEnd = index === 0 ? 0 : segments.slice(0, index).reduce((sum, s) => sum + s.percentage, 0);
            const startDeg = prevEnd * 3.6;
            const endDeg = (prevEnd + segment.percentage) * 3.6;
            return `${segment.color} ${startDeg}deg ${endDeg}deg`;
        }).join(', ');
        
        chartContainer.innerHTML = `
            <div class="pie-chart-circle" style="background: conic-gradient(${gradientStops});"></div>
        `;
        
        // Create legend
        legendContainer.innerHTML = segments.map(segment => 
            `<div class="legend-item">
                <div class="legend-color" style="background-color: ${segment.color}"></div>
                <span>${segment.label}: ${segment.count} (${Math.round(segment.percentage)}%)</span>
            </div>`
        ).join('');
    }
    
    updateServerChart(complaints) {
        const serverCounts = { '1': 0, '12': 0 };
        complaints.forEach(c => {
            serverCounts[c.server] = (serverCounts[c.server] || 0) + 1;
        });
        
        const maxCount = Math.max(serverCounts['1'], serverCounts['12'], 1);
        const chartContainer = document.getElementById('serverChart');
        
        chartContainer.innerHTML = `
            <div class="bar-item">
                <div class="bar-label">Сервер 1</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${(serverCounts['1'] / maxCount) * 100}%"></div>
                </div>
                <div class="bar-value">${serverCounts['1']}</div>
            </div>
            <div class="bar-item">
                <div class="bar-label">Сервер 12</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${(serverCounts['12'] / maxCount) * 100}%"></div>
                </div>
                <div class="bar-value">${serverCounts['12']}</div>
            </div>
        `;
    }
    
    updateTopViolations(complaints) {
        const violationCounts = {};
        complaints.forEach(c => {
            violationCounts[c.violation] = (violationCounts[c.violation] || 0) + 1;
        });
        
        const sorted = Object.entries(violationCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        const container = document.getElementById('topViolations');
        
        if (sorted.length === 0) {
            container.innerHTML = '<div class="no-data">Нет данных</div>';
            return;
        }
        
        container.innerHTML = sorted.map((item, index) => 
            `<div class="stat-row">
                <span class="rank">${index + 1}</span>
                <span class="violation-text">${item[0]}</span>
                <span class="count">${item[1]}</span>
            </div>`
        ).join('');
    }
    
    updateTimeHeatmap(complaints) {
        const hourCounts = new Array(24).fill(0);
        
        complaints.forEach(c => {
            const hour = new Date(c.violationDate).getHours();
            hourCounts[hour]++;
        });
        
        const maxCount = Math.max(...hourCounts, 1);
        const container = document.getElementById('timeHeatmap');
        
        container.innerHTML = `
            <div class="heatmap-grid">
                ${hourCounts.map((count, hour) => {
                    const intensity = count / maxCount;
                    return `<div class="heatmap-cell" 
                        style="--intensity: ${intensity}" 
                        title="${hour}:00 - ${count} жалоб">
                        ${hour}
                    </div>`;
                }).join('')}
            </div>
        `;
    }
    
    updateTemplateUsage(nicknameTemplates, violationTemplates) {
        const container = document.getElementById('templateUsage');
        
        const totalNicknames = Object.keys(nicknameTemplates).length;
        const totalViolations = Object.keys(violationTemplates).length;
        const totalUsage = Object.values(nicknameTemplates).reduce((a, b) => a + b, 0) + 
                          Object.values(violationTemplates).reduce((a, b) => a + b, 0);
        
        container.innerHTML = `
            <div class="usage-stat">
                <div class="usage-number">${totalNicknames}</div>
                <div class="usage-label">Шаблонов ников</div>
            </div>
            <div class="usage-stat">
                <div class="usage-number">${totalViolations}</div>
                <div class="usage-label">Шаблонов нарушений</div>
            </div>
            <div class="usage-stat">
                <div class="usage-number">${totalUsage}</div>
                <div class="usage-label">Общих использований</div>
            </div>
        `;
    }
    
    updateTelegramUsage(telegramStats) {
        const container = document.getElementById('telegramUsage');
        const successRate = telegramStats.sent > 0 ? 
            Math.round((telegramStats.success / telegramStats.sent) * 100) : 0;
        
        container.innerHTML = `
            <div class="usage-stat">
                <div class="usage-number">${telegramStats.sent}</div>
                <div class="usage-label">Отправлено</div>
            </div>
            <div class="usage-stat">
                <div class="usage-number">${telegramStats.success}</div>
                <div class="usage-label">Успешно</div>
            </div>
            <div class="usage-stat">
                <div class="usage-number">${successRate}%</div>
                <div class="usage-label">Эффективность</div>
            </div>
        `;
    }

    // Utility methods
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const iconMap = {
            'success': 'check-circle',
            'warning': 'exclamation-triangle',
            'error': 'times-circle',
            'info': 'info-circle'
        };
        
        notification.innerHTML = `
            <i class="fas fa-${iconMap[type] || 'info-circle'}"></i>
            ${message}
        `;
        
        // Add styles for notification
        const colors = {
            'success': '#00cc66',
            'warning': '#ff9800',
            'error': '#f44336',
            'info': '#2196f3'
        };
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: colors[type] || '#2196f3',
            color: 'white',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: '9999',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            maxWidth: '350px',
            animation: 'slideIn 0.3s ease-out'
        });
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentElement) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // Enhanced Theme Management
    toggleThemeSelector() {
        const selector = document.getElementById('themeSelector');
        const isVisible = selector.style.display !== 'none';
        selector.style.display = isVisible ? 'none' : 'block';
    }
    
    setTheme(theme) {
        this.currentTheme = theme;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Update active button
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.theme-btn[data-theme="${theme}"]`)?.classList.add('active');
        
        this.playSound('theme-change');
        this.showSuccess(`Тема сменена на ${this.getThemeName(theme)}! 🎈`);
    }
    
    getThemeName(theme) {
        const names = {
            'dark': 'Тёмная',
            'light': 'Светлая',
            'light-red': 'Светлая',
            'barbie': 'Розовая',
            'dark-pink': 'Тёмно-розовая',
            'dark-red': 'Тёмно-красная',
            'custom': 'Кастомная'
        };
        return names[theme] || theme;
    }
    
    openCustomThemeEditor() {
        const modal = document.getElementById('customThemeModal');
        const customTheme = JSON.parse(localStorage.getItem('customTheme') || '{}');
        
        if (customTheme.name) {
            document.getElementById('customThemeName').value = customTheme.name;
            document.getElementById('customAccentColor').value = customTheme.accentColor || '#E91E63';
            document.getElementById('customBgColor').value = customTheme.bgColor || '#FFFFFF';
            document.getElementById('customTextColor').value = customTheme.textColor || '#000000';
            document.getElementById('customCardBg').value = customTheme.cardBg || '#FFFFFF';
            document.getElementById('customBorderColor').value = customTheme.borderColor || '#E0E0E0';
        }
        
        this.updateThemePreview();
        modal.style.display = 'flex';
    }
    
    updateThemePreview() {
        const accentColor = document.getElementById('customAccentColor')?.value;
        const bgColor = document.getElementById('customBgColor')?.value;
        const textColor = document.getElementById('customTextColor')?.value;
        const cardBg = document.getElementById('customCardBg')?.value;
        const borderColor = document.getElementById('customBorderColor')?.value;
        
        const preview = document.getElementById('themePreviewCard');
        if (preview && accentColor) {
            preview.style.backgroundColor = cardBg;
            preview.style.borderColor = borderColor;
            const header = preview.querySelector('.preview-header');
            const content = preview.querySelector('.preview-content');
            const button = preview.querySelector('.preview-button');
            if (header) header.style.color = accentColor;
            if (content) content.style.color = textColor;
            if (button) button.style.backgroundColor = accentColor;
        }
    }
    
    saveCustomTheme() {
        const name = document.getElementById('customThemeName')?.value.trim();
        if (!name) {
            this.showNotification('Введите название темы', 'warning');
            return;
        }
        
        const customTheme = {
            name: name,
            accentColor: document.getElementById('customAccentColor')?.value || '#E91E63',
            bgColor: document.getElementById('customBgColor')?.value || '#FFFFFF',
            textColor: document.getElementById('customTextColor')?.value || '#000000',
            cardBg: document.getElementById('customCardBg')?.value || '#FFFFFF',
            borderColor: document.getElementById('customBorderColor')?.value || '#E0E0E0'
        };
        
        localStorage.setItem('customTheme', JSON.stringify(customTheme));
        this.setCustomTheme(customTheme);
        document.getElementById('customThemeModal').style.display = 'none';
        this.showSuccess(`Тема "${name}" сохранена!`);
    }
    
    setCustomTheme(theme) {
        let style = document.getElementById('custom-theme-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'custom-theme-style';
            document.head.appendChild(style);
        }
        
        const lighten = (color, percent) => {
            const num = parseInt(color.replace("#", ""), 16);
            const amt = Math.round(2.55 * percent);
            const R = Math.min(255, Math.max(0, (num >> 16) + amt));
            const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
            const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
            return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
        };
        
        style.textContent = `
            [data-theme="custom"] {
                --accent-color: ${theme.accentColor};
                --bg-color: ${theme.bgColor};
                --text-color: ${theme.textColor};
                --card-bg: ${theme.cardBg};
                --border-color: ${theme.borderColor};
                --input-bg: ${lighten(theme.bgColor, 5)};
                --server-inactive: ${lighten(theme.bgColor, 5)};
                --glass-bg: ${theme.cardBg}CC;
                --glass-border: ${theme.borderColor}4D;
            }
        `;
        
        this.setTheme('custom');
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('customThemeBtn')?.classList.add('active');
    }
    
    // Organization Database
    loadOrganizationDatabase() {
        return {
            gangs: [
                'The Families', 'Grove Street', 'Ballas', 'Vagos', 'Aztecas',
                'Russian Mafia', 'Yakuza', 'Italian Mafia', 'Triads', 'Bratva',
                'Короны', 'Чёрные Орлы', 'Красная Мафия'
            ],
            orgs: [
                'LSPD', 'FBI', 'Army', 'Government', 'Hospital', 'School',
                'SFPD', 'LVPD', 'SWAT', 'Полиция ЛС', 'Минздрав'
            ]
        };
    }
    
    setupOrganizationAutocomplete() {
        const affiliationNameInput = document.getElementById('affiliationName');
        if (affiliationNameInput) {
            affiliationNameInput.addEventListener('input', (e) => {
                this.showOrganizationSuggestions(e.target, e.target.value);
            });
        }
    }
    
    showOrganizationSuggestions(input, query) {
        if (query.length < 1) return;
        
        const affiliation = document.getElementById('affiliation').value;
        const database = affiliation === 'gang' ? this.organizationDatabase.gangs : this.organizationDatabase.orgs;
        
        const matches = database.filter(org => 
            org.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);
        
        // Create suggestions dropdown if it doesn't exist
        let dropdown = document.getElementById('orgSuggestions');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'orgSuggestions';
            dropdown.className = 'autocomplete-dropdown';
            input.parentElement.style.position = 'relative';
            input.parentElement.appendChild(dropdown);
        }
        
        if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
        }
        
        dropdown.innerHTML = matches.map(org => 
            `<div class="autocomplete-item" data-value="${org}">
                <span>${org}</span>
            </div>`
        ).join('');
        
        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                input.value = item.dataset.value;
                dropdown.style.display = 'none';
                this.playSound('select');
                this.updateProgressBar();
            });
        });
        
        dropdown.style.display = 'block';
    }
    
    // Sound Effects System
    playSound(type) {
        if (!this.soundEnabled) return;
        
        const sounds = {
            'success': { frequency: 800, duration: 200 },
            'error': { frequency: 300, duration: 300 },
            'milestone': { frequency: 600, duration: 150 },
            'select': { frequency: 500, duration: 100 },
            'theme-change': { frequency: 700, duration: 250 },
            'warning': { frequency: 400, duration: 400 }
        };
        
        const sound = sounds[type];
        if (!sound) return;
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = sound.frequency;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sound.duration / 1000);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + sound.duration / 1000);
        } catch (error) {
            console.log('Sound not supported');
        }
    }

    // Performance mode: reduce heavy effects for smoother UX
    applyPerformanceMode() {
        const body = document.body;
        const toggle = document.getElementById('performanceToggle');

        if (this.performanceMode) {
            body.classList.add('performance-mode');
            toggle?.classList.add('active');
        } else {
            body.classList.remove('performance-mode');
            toggle?.classList.remove('active');
        }
    }

    togglePerformanceMode() {
        this.performanceMode = !this.performanceMode;
        localStorage.setItem('performanceMode', this.performanceMode);
        this.applyPerformanceMode();
    }

    showSuccessOverlay() {
        const overlay = document.getElementById('successOverlay');
        const copyBtn = document.getElementById('overlayCopy');
        const closeBtn = document.getElementById('overlayClose');
        const bbCode = document.getElementById('generatedOutput')?.value || '';

        if (overlay) overlay.style.display = 'flex';

        // Remove old listeners
        const newCopyBtn = copyBtn?.cloneNode(true);
        const newCloseBtn = closeBtn?.cloneNode(true);
        if (copyBtn && newCopyBtn) {
            copyBtn.parentNode?.replaceChild(newCopyBtn, copyBtn);
        }
        if (closeBtn && newCloseBtn) {
            closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);
        }

        newCopyBtn?.addEventListener('click', () => {
            this.copyToClipboard(bbCode);
            this.showSuccess('BB-код скопирован!');
        });

        newCloseBtn?.addEventListener('click', () => {
            // Save complaint to history before closing
            this.saveComplaintToHistory();
            overlay.style.display = 'none';
        });
    }

    saveComplaintToHistory() {
        const bbCode = document.getElementById('generatedOutput')?.value || '';
        if (!bbCode) return;

        const formData = this.getFormData();
        const complaint = {
            id: Date.now(),
            date: new Date().toISOString(),
            bbCode: bbCode,
            yourNickname: formData.yourNickname,
            violatorNickname: formData.violatorNickname,
            violation: formData.violation,
            violationDate: formData.violationDate,
            affiliation: formData.affiliation,
            affiliationName: formData.affiliationName,
            server: formData.server
        };

        this.complaints.unshift(complaint);
        if (this.complaints.length > 1000) {
            this.complaints = this.complaints.slice(0, 1000);
        }

        localStorage.setItem('complaints', JSON.stringify(this.complaints));
        this.complaintsCache = null; // Invalidate cache
        
        // Refresh history if on history tab
        if (this.currentTab === 'history') {
            this.loadComplaints(); // Use optimized loadComplaints
        }
    }
    
    // OCR Functionality
    initializeOCR() {
        const uploadArea = document.getElementById('uploadArea');
        const imageInput = document.getElementById('imageInput');
        const processButton = document.getElementById('processImage');
        const clearButton = document.getElementById('clearImage');
        
        if (!uploadArea) return;
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleImageUpload(files[0]);
            }
        });
        
        // Click to upload
        uploadArea.addEventListener('click', () => {
            imageInput.click();
        });
        
        imageInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleImageUpload(e.target.files[0]);
            }
        });
        
        processButton?.addEventListener('click', () => this.processImage());
        clearButton?.addEventListener('click', () => this.clearOCR());
    }
    
    handleImageUpload(file) {
        if (!file.type.startsWith('image/')) {
            this.showError('', 'Пожалуйста, выберите файл изображения');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentImage = e.target.result;
            this.showImagePreview(e.target.result);
            document.getElementById('ocrControls').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
    
    showImagePreview(imageSrc) {
        const previewSection = document.getElementById('previewSection');
        const previewImage = document.getElementById('previewImage');
        
        previewImage.src = imageSrc;
        previewSection.style.display = 'block';
    }
    
    async processImage() {
        if (!this.currentImage) return;
        
        const loadingSection = document.getElementById('loadingSection');
        const resultsSection = document.getElementById('resultsSection');
        
        loadingSection.style.display = 'block';
        resultsSection.style.display = 'none';
        
        try {
            const result = await Tesseract.recognize(this.currentImage, 'rus+eng');
            
            loadingSection.style.display = 'none';
            this.showOCRResults(result.data.text);
            this.playSound('success');
            
        } catch (error) {
            loadingSection.style.display = 'none';
            this.showError('', 'Ошибка обработки изображения');
            this.playSound('error');
        }
    }
    
    showOCRResults(text) {
        const resultsSection = document.getElementById('resultsSection');
        const recognizedText = document.getElementById('recognizedText');
        const nicknameSuggestions = document.getElementById('nicknameSuggestions');
        
        recognizedText.textContent = text;
        
        // Extract potential nicknames
        const nicknames = this.extractNicknames(text);
        
        if (nicknames.length > 0) {
            nicknameSuggestions.innerHTML = `
                <h4>Найденные никнеймы:</h4>
                ${nicknames.map(nick => 
                    `<span class="nickname-suggestion" onclick="complaintGenerator.useNickname('${nick}')">${nick}</span>`
                ).join('')}
            `;
            
            document.getElementById('useNickname').style.display = 'block';
            this.selectedNickname = nicknames[0];
        }
        
        resultsSection.style.display = 'block';
    }
    
    extractNicknames(text) {
        // Radmir nickname format: Name_Surname (English only)
        const radmirPattern = /\b[A-Z][a-z]+_[A-Z][a-z]+\b/g;
        const radmirNicks = text.match(radmirPattern) || [];
        
        // Fallback: look for any English names with underscore
        const fallbackPattern = /\b[A-Za-z]+_[A-Za-z]+\b/g;
        const fallbackNicks = text.match(fallbackPattern) || [];
        
        // Combine and filter unique
        const allNicks = [...new Set([...radmirNicks, ...fallbackNicks])];
        
        // Validate nicknames (3-20 chars, contains underscore)
        const validNicks = allNicks.filter(nick => 
            nick.length >= 3 && nick.length <= 20 && nick.includes('_')
        );
        
        return validNicks.slice(0, 5);
    }
    
    useNickname(nickname) {
        this.selectedNickname = nickname;
        document.getElementById('violatorNickname').value = nickname;
        this.switchTab('form');
        this.playSound('success');
        this.showSuccess(`Никнейм ${nickname} добавлен в форму! 🎯`);
    }
    
    clearOCR() {
        this.currentImage = null;
        document.getElementById('previewSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('ocrControls').style.display = 'none';
        document.getElementById('imageInput').value = '';
    }
    
    loadOCRTab() {
        // Initialize OCR tab when loaded
        if (!this.ocrInitialized) {
            this.initializeOCR();
            this.ocrInitialized = true;
        }
    }
    
    // Warning System
    startWarningSystem() {
        // Check every 10 minutes for expiring complaints
        setInterval(() => {
            this.checkExpiringComplaints();
        }, 10 * 60 * 1000);
        
        // Initial check
        setTimeout(() => this.checkExpiringComplaints(), 5000);
    }
    
    checkExpiringComplaints() {
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const now = Date.now();
        
        complaints.forEach(complaint => {
            const violationTime = new Date(complaint.violationDate).getTime();
            const hoursPassed = (now - violationTime) / (1000 * 60 * 60);
            const hoursLeft = 72 - hoursPassed;
            
            // Warn at 6 hours, 3 hours, and 1 hour remaining
            if (this.shouldWarn(hoursLeft, complaint)) {
                this.sendExpirationWarning(complaint, hoursLeft);
            }
        });
    }
    
    shouldWarn(hoursLeft, complaint) {
        const warningKey = `warned_${complaint.timestamp}`;
        const lastWarning = localStorage.getItem(warningKey);
        
        if (hoursLeft <= 1 && !lastWarning?.includes('1h')) {
            localStorage.setItem(warningKey, (lastWarning || '') + '1h ');
            return true;
        }
        if (hoursLeft <= 3 && !lastWarning?.includes('3h')) {
            localStorage.setItem(warningKey, (lastWarning || '') + '3h ');
            return true;
        }
        if (hoursLeft <= 6 && !lastWarning?.includes('6h')) {
            localStorage.setItem(warningKey, (lastWarning || '') + '6h ');
            return true;
        }
        
        return false;
    }
    
    sendExpirationWarning(complaint, hoursLeft) {
        const hoursText = Math.floor(hoursLeft);
        const minutesText = Math.floor((hoursLeft % 1) * 60);
        const timeLeft = `${hoursText}ч ${minutesText}м`;
        
        // System notification (Windows) via Electron IPC
        if (window.electron && window.electron.ipcRenderer) {
            window.electron.ipcRenderer.invoke('show-system-notification', 
                '⚠️ Жалоба скоро просрочится!',
                `На ${complaint.violatorNickname} - осталось ${timeLeft}`,
                { urgency: 'critical' }
            ).catch(err => console.log('System notification failed:', err));
        } else if (Notification.permission === 'granted') {
            // Browser notification fallback
            new Notification('⚠️ Жалоба скоро просрочится!', {
                body: `На ${complaint.violatorNickname} - осталось ${timeLeft}`,
                icon: '/favicon.ico'
            });
        }
        
        // In-app notification
        this.showNotification(
            `⚠️ Жалоба на ${complaint.violatorNickname} просрочится через ${timeLeft}!`,
            'warning'
        );
        
        // Telegram notification if configured
        this.sendTelegramWarning(complaint, timeLeft);
        
        this.playSound('warning');
    }
    
    checkExpiredComplaints() {
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const now = Date.now();
        
        complaints.forEach(complaint => {
            if (!complaint.violationDate) return;
            
            const violationTime = new Date(complaint.violationDate).getTime();
            const hoursDiff = (now - violationTime) / (1000 * 60 * 60);
            
            // Если жалоба просрочена (больше 72 часов)
            if (hoursDiff > 72 && !complaint.expiredNotified) {
                // Системное уведомление Windows
                if (window.electron && window.electron.ipcRenderer) {
                    window.electron.ipcRenderer.invoke('show-system-notification',
                        '🚨 Жалоба просрочена!',
                        `Жалоба на ${complaint.violatorNickname} просрочена. Немедленно отправьте на форум!`,
                        { urgency: 'critical' }
                    ).catch(err => console.log('System notification failed:', err));
                } else if (Notification.permission === 'granted') {
                    new Notification('🚨 Жалоба просрочена!', {
                        body: `Жалоба на ${complaint.violatorNickname} просрочена. Немедленно отправьте на форум!`,
                        icon: '/favicon.ico'
                    });
                }
                
                // In-app notification
                this.showNotification(
                    `🚨 Жалоба на ${complaint.violatorNickname} просрочена!`,
                    'error'
                );
                
                // Помечаем как уведомленную
                complaint.expiredNotified = true;
                localStorage.setItem('complaints', JSON.stringify(complaints));
                this.complaintsCache = null; // Invalidate cache
            }
        });
    }
    
    sendTelegramWarning(complaint, timeLeft) {
        const telegramConfig = JSON.parse(localStorage.getItem('telegramConfig') || '{}');
        
        if (telegramConfig.botToken && telegramConfig.chatId && window.telegramIntegration) {
            const warningMessage = `⚠️ ПРЕДУПРЕЖДЕНИЕ!\n\n🚨 Жалоба скоро просрочится!\n\n🎯 Нарушитель: ${complaint.violatorNickname}\n⚠️ Нарушение: ${complaint.violation}\n⏰ Осталось времени: ${timeLeft}\n\nСрочно отправьте на форум!`;
            
            window.telegramIntegration.sendMessage(warningMessage)
                .catch(error => console.log('Telegram warning failed:', error));
        }
    }
    
    // Request notification permission on first load
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
    
    // AutoHotkey integration system
    initializeAutoSubmit() {
        const loadQueueBtn = document.getElementById('loadQueue');
        const startBtn = document.getElementById('startAutoSubmit');
        const stopBtn = document.getElementById('stopAutoSubmit');
        
        // Built-in auto-submit buttons
        const startBuiltinBtn = document.getElementById('startAutoSubmitBuiltin');
        const stopBuiltinBtn = document.getElementById('stopAutoSubmitBuiltin');
        
        startBuiltinBtn?.addEventListener('click', () => this.startBuiltinAutoSubmit());
        stopBuiltinBtn?.addEventListener('click', () => this.stopBuiltinAutoSubmit());
        
        this.autoSubmitRunning = false;
        this.autoSubmitProcessed = 0;
        this.autoSubmitTotal = 0;
        
        loadQueueBtn?.addEventListener('click', () => this.loadSubmitQueue());
        startBtn?.addEventListener('click', () => this.startBulkAutoSubmission());
        stopBtn?.addEventListener('click', () => this.stopBulkSubmission());
        
        // Queue management
        document.getElementById('selectAllQueue')?.addEventListener('click', () => this.selectAllQueueItems());
        document.getElementById('deselectAllQueue')?.addEventListener('click', () => this.deselectAllQueueItems());
        document.getElementById('removeSelected')?.addEventListener('click', () => this.removeSelectedFromQueue());
        document.getElementById('clearQueue')?.addEventListener('click', () => this.clearSubmitQueue());
        
        // Single complaint AutoHotkey buttons
        document.getElementById('prepareAHK')?.addEventListener('click', () => this.prepareAHKSubmission());
        
        // File checking buttons
        document.getElementById('checkAutosubmitFiles')?.addEventListener('click', () => this.checkAutosubmitFiles());
        document.getElementById('openAutosubmitFolder')?.addEventListener('click', () => this.openAutosubmitFolder());
    }
    
    loadAutoSubmitTab() {
        // Initialize when tab is loaded
        if (!this.autoSubmitInitialized) {
            this.initializeAutoSubmit();
            this.autoSubmitInitialized = true;
        }
        
        // Привязываем обработчики для кнопок проверки файлов при загрузке вкладки
        // (кнопки могут быть недоступны при первой инициализации)
        const checkFilesBtn = document.getElementById('checkAutosubmitFiles');
        const openFolderBtn = document.getElementById('openAutosubmitFolder');
        
        if (checkFilesBtn) {
            // Удаляем все старые обработчики, клонируя элемент
            const newCheckBtn = checkFilesBtn.cloneNode(true);
            checkFilesBtn.parentNode.replaceChild(newCheckBtn, checkFilesBtn);
            newCheckBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Check files button clicked');
                this.checkAutosubmitFiles();
            });
            console.log('Check files button handler attached');
        } else {
            console.warn('checkAutosubmitFiles button not found in DOM');
        }
        
        if (openFolderBtn) {
            // Удаляем все старые обработчики, клонируя элемент
            const newOpenBtn = openFolderBtn.cloneNode(true);
            openFolderBtn.parentNode.replaceChild(newOpenBtn, openFolderBtn);
            newOpenBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Open folder button clicked');
                this.openAutosubmitFolder();
            });
            console.log('Open folder button handler attached');
        } else {
            console.warn('openAutosubmitFolder button not found in DOM');
        }
        
        // Загружаем очередь автоподачи если есть
        if (this.autoSubmitQueue && this.autoSubmitQueue.length > 0) {
            this.renderSubmitQueue();
        }
    }

    // Загрузка очереди для выборочной подачи (из истории)
    loadSubmitQueueFromHistory() {
        this.loadSubmitQueue();
        this.showSuccess('📋 История жалоб загружена в очередь. Отметьте нужные и нажмите "Подготовить выборочные данные".');
    }
    
    loadSubmitQueue() {
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const serverFilterEl = document.getElementById('filterByServer');
        const affiliationFilterEl = document.getElementById('filterByAffiliation');
        
        const serverFilter = serverFilterEl ? serverFilterEl.value : 'all';
        const affiliationFilter = affiliationFilterEl ? affiliationFilterEl.value : 'all';
        
        let filteredComplaints = complaints.filter(complaint => {
            const now = Date.now();
            const hoursPassed = (now - new Date(complaint.violationDate).getTime()) / (1000 * 60 * 60);
            
            // Only include active complaints (not expired)
            if (hoursPassed > 72) return false;
            
            // Apply server filter
            if (serverFilter !== 'all' && complaint.server !== serverFilter) return false;
            
            // Apply affiliation filter
            if (affiliationFilter !== 'all' && complaint.affiliation !== affiliationFilter) return false;
            
            return true;
        });
        
        // Sort by violation date (oldest first)
        filteredComplaints.sort((a, b) => new Date(a.violationDate) - new Date(b.violationDate));
        
        this.currentSubmissionQueue = filteredComplaints.map((complaint, index) => ({
            ...complaint,
            queueIndex: index,
            status: 'pending'
        }));
        
        this.renderSubmitQueue();
        
        if (this.currentSubmissionQueue.length > 0) {
            const startBtn = document.getElementById('startAutoSubmit');
            if (startBtn) {
                startBtn.style.display = 'block';
            }
            this.showSuccess(`📋 Загружено ${this.currentSubmissionQueue.length} жалоб в очередь для AutoHotkey!`);
        } else {
            this.showNotification('Нет активных жалоб для очереди', 'warning');
        }
    }
    
    renderSubmitQueue() {
        const container = document.getElementById('submitQueue');
        const countElement = document.getElementById('queueCount');
        
        if (!container) {
            console.warn('submitQueue element not found');
            return;
        }
        
        // Проверяем, что очередь инициализирована
        if (!this.currentSubmissionQueue) {
            this.currentSubmissionQueue = [];
        }
        if (!this.autoSubmitQueue) {
            this.autoSubmitQueue = [];
        }
        
        // Используем currentSubmissionQueue для отображения
        const queueToShow = this.currentSubmissionQueue;
        
        if (countElement) {
            countElement.textContent = queueToShow.length;
        }
        
        if (queueToShow.length === 0) {
            container.innerHTML = '<div class="queue-empty">📆 Очередь пуста - загрузите жалобы для AutoHotkey</div>';
            return;
        }
        
        container.innerHTML = queueToShow.map(complaint => 
            `<div class="queue-item ${complaint.status || 'pending'} ${complaint.selected ? 'selected' : ''}" data-index="${complaint.queueIndex || 0}">
                <input type="checkbox" class="queue-item-checkbox" 
                       ${complaint.selected ? 'checked' : ''}
                       onchange="complaintGenerator.toggleQueueItem(${complaint.queueIndex || 0})">
                <div class="queue-item-header">
                    <div class="queue-item-title">🎯 ${complaint.violatorNickname || 'Неизвестный'}</div>
                    <div class="queue-item-status status-${complaint.status || 'pending'}">${this.getAHKStatusText(complaint.status || 'pending')}</div>
                </div>
                <div class="queue-item-info">
                    <div class="queue-item-detail">
                        <i class="fas fa-exclamation-circle"></i> ${complaint.violation || 'Нарушение'}
                    </div>
                    <div class="queue-item-detail">
                        <i class="fas fa-server"></i> Сервер ${complaint.server || '1'}
                    </div>
                    <div class="queue-item-detail">
                        <i class="fas fa-users"></i> ${this.getAffiliationBadge(complaint.affiliation || 'none')}
                    </div>
                    <div class="queue-item-detail">
                        <i class="fas fa-clock"></i> ${complaint.violationDate ? new Date(complaint.violationDate).toLocaleString('ru') : 'Не указано'}
                    </div>
                </div>
                <div class="queue-item-actions">
                    <button class="btn btn-sm btn-primary" onclick="complaintGenerator.prepareSingleComplaint(${complaint.queueIndex || 0})">
                        🚀 Подготовить
                    </button>
                </div>
            </div>`
        ).join('');
        
        this.updateRemoveButton();
    }
    
    getStatusText(status) {
        const statusMap = {
            'pending': 'Ожидание',
            'processing': 'Обработка',
            'completed': 'Готово',
            'error': 'Ошибка'
        };
        return statusMap[status] || status;
    }
    
    getAHKStatusText(status) {
        const statusMap = {
            'pending': '🔄 Ожидание',
            'prepared': '📋 Подготовлено',
            'processing': '🚀 Обработка',
            'completed': '✅ Готово',
            'error': '❌ Ошибка'
        };
        return statusMap[status] || status;
    }
    
    // AutoHotkey массовая автоподача
    async startBulkAutoSubmission() {
        if (this.currentSubmissionQueue.length === 0) {
            this.showNotification('Очередь пуста!', 'warning');
            return;
        }
        
        this.showNotification(`🚀 Подготовка ${this.currentSubmissionQueue.length} жалоб для AutoHotkey`, 'info');
        
        // Создаем файл с первой жалобой
        const firstComplaint = this.currentSubmissionQueue[0];
        const title = this.generateComplaintTitle(firstComplaint);
        const content = this.generateComplaintBBCode(firstComplaint);
        
        await this.createAHKDataFile(title, content);
        
        this.showBulkAHKInstructions();
        this.playSound('success');
    }
    
    // AutoHotkey utility methods
    async createAHKDataFile(title, content) {
        const data = `title:${title}\ncontent:${content}`;
        
        // Создаем ссылку для скачивания файла
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        // Автоматически скачиваем файл
        const a = document.createElement('a');
        a.href = url;
        a.download = 'complaint_data.txt';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        this.showNotification('📄 Файл данных создан: complaint_data.txt', 'info', 3000);
    }
    
    showAHKSetupInstructions() {
        const instructionsHTML = `
            <div class="alert alert-info ahk-setup-info">
                <h5>🚀 AutoHotkey Автоматизация</h5>
                <div class="row">
                    <div class="col-md-6">
                        <h6>📜 Настройка:</h6>
                        <ol>
                            <li>Скачайте и установите <a href="https://www.autohotkey.com/" target="_blank">AutoHotkey</a></li>
                            <li>Запустите скрипт <code>radmir-autosubmit.ahk</code></li>
                            <li>Убедитесь, что скрипт в трее</li>
                        </ol>
                    </div>
                    <div class="col-md-6">
                        <h6>⚙️ Горячие клавиши:</h6>
                        <ul class="list-unstyled">
                            <li><kbd>Ctrl+Shift+R</kbd> - Полная автоматизация</li>
                            <li><kbd>Ctrl+Shift+T</kbd> - Вставить заголовок</li>
                            <li><kbd>Ctrl+Shift+C</kbd> - Вставить содержимое</li>
                            <li><kbd>Ctrl+Shift+F</kbd> - Завершить отправку</li>
                        </ul>
                    </div>
                </div>
                <div class="text-center mt-3">
                    <button class="btn btn-outline-info btn-sm" onclick="this.parentElement.parentElement.remove()">Понятно 👍</button>
                </div>
            </div>
        `;
        
        const container = document.querySelector('#autosubmit');
        if (container) {
            const existing = container.querySelector('.ahk-setup-info');
            if (!existing) {
                container.insertAdjacentHTML('afterbegin', instructionsHTML);
            }
        }
    }
    
    prepareSingleComplaint(queueIndex) {
        const complaint = this.currentSubmissionQueue.find(c => c.queueIndex === queueIndex);
        if (!complaint) return;
        
        const title = this.generateComplaintTitle(complaint);
        const content = this.generateComplaintBBCode(complaint);
        
        this.createAHKDataFile(title, content);
        complaint.status = 'prepared';
        this.renderSubmitQueue();
        
        this.showNotification(`📋 Жалоба на ${complaint.violatorNickname} подготовлена для AutoHotkey`, 'success');
    }
    
    showBulkAHKInstructions() {
        const instructions = `
            <div class="bulk-ahk-instructions p-4 border rounded bg-primary text-white">
                <h5>🚀 Массовая автоподача готова!</h5>
                <div class="alert alert-light mb-3">
                    <strong>Жалоб в очереди:</strong> ${this.currentSubmissionQueue.length}
                    <br>
                    <strong>Текущая жалоба:</strong> ${this.currentSubmissionQueue[0]?.violatorNickname || 'N/A'}
                </div>
                <div class="alert alert-warning text-dark">
                    <strong>Инструкции:</strong>
                    <ol class="mt-2 mb-0">
                        <li>Откройте форум в отдельной вкладке</li>
                        <li>Поставьте курсор в поле заголовка</li>
                        <li>Нажмите <kbd>Ctrl+Shift+R</kbd> для отправки текущей жалобы</li>
                        <li>После отправки вернитесь сюда и нажмите кнопку ниже</li>
                        <li>Повторите для всех жалоб в очереди</li>
                    </ol>
                </div>
                <div class="text-center mt-3">
                    <button class="btn btn-light me-2" onclick="complaintGenerator.nextComplaintInQueue()">➡️ Следующая жалоба</button>
                    <button class="btn btn-outline-light" onclick="complaintGenerator.stopBulkSubmission()">⏹️ Остановить</button>
                </div>
            </div>
        `;
        
        const container = document.querySelector('#autosubmit');
        if (container) {
            // Удаляем предыдущие инструкции
            const existing = container.querySelector('.bulk-ahk-instructions');
            if (existing) existing.remove();
            
            const instructionsDiv = document.createElement('div');
            instructionsDiv.innerHTML = instructions;
            container.insertBefore(instructionsDiv, container.firstChild);
        }
    }
    
    nextComplaintInQueue() {
        if (this.currentSubmissionQueue.length <= 1) {
            this.showNotification('✅ Все жалобы обработаны!', 'success');
            this.stopBulkSubmission();
            return;
        }
        
        // Помечаем текущую жалобу как отправленную
        const currentComplaint = this.currentSubmissionQueue.shift();
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const index = complaints.findIndex(c => c.timestamp === currentComplaint.timestamp);
        if (index !== -1) {
            complaints[index].submitted = true;
            complaints[index].submittedAt = new Date().toISOString();
            localStorage.setItem('complaints', JSON.stringify(complaints));
            this.complaintsCache = null; // Invalidate cache
        }
        
        // Подготавливаем следующую жалобу
        if (this.currentSubmissionQueue.length > 0) {
            const nextComplaint = this.currentSubmissionQueue[0];
            const title = this.generateComplaintTitle(nextComplaint);
            const content = this.generateComplaintBBCode(nextComplaint);
            
            this.createAHKDataFile(title, content);
            this.showBulkAHKInstructions(); // Обновляем счетчик
            
            this.showNotification(`📝 Следующая жалоба подготовлена: ${nextComplaint.violatorNickname}`, 'info');
        }
        
        this.loadComplaints();
    }
    
    stopBulkSubmission() {
        this.currentSubmissionQueue = [];
        this.ahkActive = false;
        
        // Удаляем инструкции
        const instructions = document.querySelectorAll('.bulk-ahk-instructions, .ahk-instructions');
        instructions.forEach(el => el.remove());
        
        this.showNotification('⏹️ Массовая автоподача остановлена', 'info');
    }
    
    // Методы для управления очередью
    toggleQueueItem(queueIndex) {
        const item = this.currentSubmissionQueue.find(c => c.queueIndex === queueIndex);
        if (item) {
            item.selected = !item.selected;
            this.renderSubmitQueue();
        }
    }
    
    selectAllQueueItems() {
        this.currentSubmissionQueue.forEach(item => item.selected = true);
        this.renderSubmitQueue();
    }
    
    deselectAllQueueItems() {
        this.currentSubmissionQueue.forEach(item => item.selected = false);
        this.renderSubmitQueue();
    }
    
    removeSelectedFromQueue() {
        this.currentSubmissionQueue = this.currentSubmissionQueue.filter(item => !item.selected);
        // Переиндексируем
        this.currentSubmissionQueue.forEach((item, index) => {
            item.queueIndex = index;
        });
        this.renderSubmitQueue();
        this.showNotification('Выбранные элементы удалены', 'info');
    }
    
    clearSubmitQueue() {
        this.currentSubmissionQueue = [];
        this.renderSubmitQueue();
        this.showNotification('Очередь очищена', 'info');
    }
    
    updateRemoveButton() {
        const removeBtn = document.getElementById('removeSelected');
        if (removeBtn) {
            const selectedCount = this.currentSubmissionQueue.filter(item => item.selected).length;
            removeBtn.style.display = selectedCount > 0 ? 'block' : 'none';
        }
    }
    
    // Подготовка текущей жалобы для AutoHotkey
    prepareAHKSubmission() {
        const outputElement = document.getElementById('generatedOutput');
        if (!outputElement || !outputElement.value) {
            this.showNotification('Начала создайте жалобу!', 'warning');
            return;
        }
        
        const title = this.generateCurrentComplaintTitle();
        const content = outputElement.value;
        
        this.createAHKDataFile(title, content);
        this.showSingleAHKInstructions(title);
    }
    
    generateCurrentComplaintTitle() {
        const violatorNickname = document.getElementById('violatorNickname').value || 'Неизвестный';
        const violation = document.getElementById('violation').value || 'Нарушение';
        return `Жалоба на игрока ${violatorNickname} (${violation})`;
    }
    
    generateComplaintTitle(complaint) {
        return `Жалоба на игрока ${complaint.violatorNickname} (${complaint.violation})`;
    }
    
    generateComplaintBBCode(complaint) {
        return this.generateBBCode(complaint);
    }
    
    showSingleAHKInstructions(title) {
        const instructions = `
            <div class="single-ahk-instructions p-3 border rounded bg-success text-white">
                <h6>🚀 AutoHotkey готов к работе!</h6>
                <div class="mb-3">
                    <strong>Заголовок:</strong> ${title}
                </div>
                <div class="alert alert-light text-dark mb-3">
                    <strong>Инструкции:</strong>
                    <ol class="mb-0">
                        <li>Откройте нужный раздел форума</li>
                        <li>Поставьте курсор в поле заголовка</li>
                        <li>Нажмите <kbd>Ctrl+Shift+R</kbd> для полной автоматизации</li>
                    </ol>
                </div>
                <div class="text-center">
                    <button class="btn btn-outline-light btn-sm" onclick="this.parentElement.remove()">Понятно ✓</button>
                </div>
            </div>
        `;
        
        const container = document.querySelector('#output-section');
        if (container) {
            const existing = container.querySelector('.single-ahk-instructions');
            if (existing) existing.remove();
            
            const instructionsDiv = document.createElement('div');
            instructionsDiv.innerHTML = instructions;
            container.appendChild(instructionsDiv);
        }
    }
    
    processNextSubmission(delay) {
        if (!this.autoSubmitRunning || this.currentSubmitIndex >= this.autoSubmitQueue.length) {
            this.autoSubmitRunning = false;
            document.getElementById('startAutoSubmit').style.display = 'block';
            document.getElementById('stopAutoSubmit').style.display = 'none';
            this.showSuccess('Все жалобы обработаны! 🎉');
            return;
        }
        
        const complaint = this.autoSubmitQueue[this.currentSubmitIndex];
        
        // Update progress
        this.updateSubmitProgress(complaint);
        
        // Mark as processing
        complaint.status = 'processing';
        this.renderSubmitQueue();
        
        // Submit the complaint
        this.submitComplaintToForum(complaint)
            .then(() => {
                complaint.status = 'completed';
                this.playSound('success');
            })
            .catch(error => {
                complaint.status = 'error';
                console.error('Submission error:', error);
                this.playSound('error');
            })
            .finally(() => {
                this.renderSubmitQueue();
                this.currentSubmitIndex++;
                
                if (this.autoSubmitRunning) {
                    this.scheduleNextSubmission(delay);
                }
            });
    }
    
    scheduleNextSubmission(delay) {
        let timeLeft = delay / 1000;
        
        const countdownInterval = setInterval(() => {
            if (!this.autoSubmitRunning) {
                clearInterval(countdownInterval);
                return;
            }
            
            document.getElementById('nextSubmitIn').textContent = `${timeLeft}с`;
            timeLeft--;
            
            if (timeLeft < 0) {
                clearInterval(countdownInterval);
                this.processNextSubmission(delay);
            }
        }, 1000);
    }
    
    updateSubmitProgress(currentComplaint) {
        const submittedCount = this.autoSubmitQueue.filter(c => c.status === 'completed').length;
        const remainingCount = this.autoSubmitQueue.length - this.currentSubmitIndex;
        
        document.getElementById('submittedCount').textContent = submittedCount;
        document.getElementById('remainingCount').textContent = remainingCount;
        
        const currentDiv = document.getElementById('currentComplaint');
        currentDiv.innerHTML = `
            <h4>Текущая жалоба:</h4>
            <p><strong>${currentComplaint.violatorNickname}</strong> - ${currentComplaint.violation}</p>
            <p>Сервер ${currentComplaint.server} | ${this.getAffiliationBadge(currentComplaint.affiliation)}</p>
        `;
    }
    
    async submitComplaintToForum(complaint) {
        // Generate the complaint content
        const bbCode = this.generateBBCode(complaint);
        const customTitle = document.getElementById('submitTitle')?.value || 'Жалоба на администрацию';
        
        console.log('Начинаем автоматическую подачу жалобы:', complaint.violatorNickname);
        
        // Get forum URL
        const forumUrl = this.getForumUrl(complaint.server, complaint.affiliation);
        
        if (!forumUrl) {
            throw new Error('Не удалось определить URL форума');
        }
        
        // Подготавливаем данные для вставки
        const formData = {
            title: customTitle,
            content: bbCode,
            separateTitle: customTitle,
            separateContent: bbCode,
            affiliation: complaint.affiliation,
            server: complaint.server
        };
        
        // Копируем всё в буфер обмена сразу
        await this.copyComplaintData(formData);
        
        // Открываем форум в новом окне
        const forumWindow = this.openForumWindow(forumUrl);
        
        // Запускаем систему автоматической отправки
        return this.handleForumSubmission(forumWindow, formData, complaint);
    }
    
    async copyComplaintData(formData) {
        try {
            // Комбинированные данные для удобства
            const clipboardText = `${formData.title}\n\n${formData.content}`;
            
            // Обеспечиваем фокус перед копированием
            await this.ensureFocusAndCopySync(clipboardText);
            
            // Также сохраняем в localStorage для дополнительного доступа
            localStorage.setItem('pendingComplaintData', JSON.stringify(formData));
            
            console.log('✅ Данные скопированы в буфер обмена');
        } catch (error) {
            console.error('Ошибка копирования в буфер:', error);
            // Продолжаем работу даже при ошибке
        }
    }
    
    // Метод для обеспечения фокуса и копирования
    ensureFocusAndCopy(text, callback) {
        console.log('🎯 Обеспечиваем фокус для копирования...');
        
        // Убеждаемся, что окно в фокусе
        window.focus();
        document.body.focus();
        
        // Небольшая задержка для получения фокуса
        setTimeout(() => {
            this.copyTextWithFallback(text)
                .then(() => {
                    console.log('✅ Текст успешно скопирован');
                    callback();
                })
                .catch((error) => {
                    console.error('❌ Ошибка копирования:', error);
                    // Продолжаем работу даже при ошибке
                    callback();
                });
        }, 500);
    }
    
    // Синхронная версия
    async ensureFocusAndCopySync(text) {
        console.log('🎯 Обеспечиваем фокус для копирования...');
        
        // Убеждаемся, что окно в фокусе
        window.focus();
        document.body.focus();
        
        // Небольшая задержка для получения фокуса
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return this.copyTextWithFallback(text);
    }
    
    // Копирование с fallback методом
    copyTextWithFallback(text) {
        return new Promise((resolve, reject) => {
            // Метод 1: современный Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => {
                        console.log('✅ Копирование через Clipboard API');
                        resolve();
                    })
                    .catch((error) => {
                        console.log('⚠️ Clipboard API не сработал, пробуем fallback:', error.message);
                        this.fallbackCopyMethod(text, resolve, reject);
                    });
            } else {
                console.log('⚠️ Clipboard API не поддерживается, используем fallback');
                this.fallbackCopyMethod(text, resolve, reject);
            }
        });
    }
    
    // Fallback метод копирования
    fallbackCopyMethod(text, resolve, reject) {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                console.log('✅ Копирование через execCommand');
                resolve();
            } else {
                console.error('❌ execCommand не сработал');
                reject(new Error('execCommand failed'));
            }
        } catch (error) {
            console.error('❌ Ошибка fallback метода:', error);
            reject(error);
        }
    }
    
    openForumWindow(url) {
        const windowFeatures = 'width=1200,height=800,scrollbars=yes,resizable=yes';
        const forumWindow = window.open(url, 'radmir_complaint_forum', windowFeatures);
        
        if (!forumWindow) {
            throw new Error('Не удалось открыть окно форума (проверьте блокировку всплывающих окон)');
        }
        
        console.log('✅ Окно форума открыто:', url);
        return forumWindow;
    }
    
    async handleForumSubmission(forumWindow, formData, complaint) {
        return new Promise((resolve, reject) => {
            console.log('Начинаем обработку отправки...');
            
            // Показываем инструкции пользователю
            this.showSmartInstructions(formData, complaint);
            
            // Мониторим состояние окна форума
            const checkWindow = () => {
                if (forumWindow.closed) {
                    console.log('✅ Окно форума закрыто - считаем отправку завершённой');
                    resolve();
                    return true;
                }
                return false;
            };
            
            // Проверяем каждые 2 секунды
            const monitorInterval = setInterval(() => {
                if (checkWindow()) {
                    clearInterval(monitorInterval);
                }
            }, 2000);
            
            // Автоматически завершаем через 60 секунд (таймаут)
            setTimeout(() => {
                if (!forumWindow.closed) {
                    console.log('⏰ Таймаут - автоматически завершаем');
                    clearInterval(monitorInterval);
                    resolve();
                }
            }, 60000);
            
            // Пытаемся программно взаимодействовать с окном
            this.attemptForumInteraction(forumWindow, formData);
        });
    }
    
    async waitForPageLoad(windowRef, timeout = 10000) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = timeout / 100;
            
            const checkLoad = () => {
                attempts++;
                
                if (attempts > maxAttempts) {
                    reject(new Error('Превышен timeout ожидания загрузки'));
                    return;
                }
                
                try {
                    if (windowRef.document && windowRef.document.readyState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkLoad, 100);
                    }
                } catch (error) {
                    // CORS error - можем предположить что страница загружена
                    resolve();
                }
            };
            
            checkLoad();
        });
    }
    
    async fillForumForm(windowRef, title, content) {
        console.log('Начинаем заполнение формы...');
        console.log('Title:', title);
        console.log('Content length:', content.length);
        
        try {
            // Проверяем доступ к окну
            if (windowRef.closed) {
                throw new Error('Окно форума закрыто');
            }
            
            let doc;
            try {
                doc = windowRef.document;
                console.log('Доступ к документу получен');
                console.log('URL:', doc.URL);
                console.log('ReadyState:', doc.readyState);
            } catch (corsError) {
                console.error('CORS ограничение - не можем получить доступ к документу:', corsError);
                // Пробуем альтернативные методы
                await this.alternativeFillMethods(windowRef, title, content);
                return;
            }
            
            // Подождём загрузку редактора
            console.log('Ожидаем загрузку редактора...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Ищем поле заголовка
            const titleSelectors = [
                'input#ctrl_title_thread_create',
                'input[name="title"]',
                'input#title', 
                '.titleField input',
                'input[placeholder*="Заголовок"]',
                'input[placeholder*="Тема"]',
                'input[type="text"]:first'
            ];
            
            console.log('Поиск поля заголовка...');
            let titleField = null;
            let titleSelectorUsed = null;
            
            for (let i = 0; i < titleSelectors.length; i++) {
                const selector = titleSelectors[i];
                titleField = doc.querySelector(selector);
                if (titleField) {
                    titleSelectorUsed = selector;
                    console.log('Поле заголовка найдено:', selector);
                    break;
                }
            }
            
            if (titleField) {
                try {
                    console.log('Заполняем заголовок:', title);
                    titleField.focus();
                    titleField.value = '';
                    titleField.value = title;
                    
                    // Множественные события для надёжности
                    const events = ['input', 'change', 'keyup', 'blur', 'focus'];
                    events.forEach(eventType => {
                        titleField.dispatchEvent(new Event(eventType, { bubbles: true }));
                    });
                    
                    console.log('Заголовок успешно заполнен');
                } catch (titleError) {
                    console.error('Ошибка заполнения заголовка:', titleError);
                }
            } else {
                console.warn('Поле заголовка не найдено!');
                console.log('Доступные input элементы:', doc.querySelectorAll('input').length);
            }
            
            // Ищем текстовый редактор
            const contentSelectors = [
                '.redactor_BbCodeWysiwygEditor.redactor_',
                '.redactor_box.activated iframe',
                'iframe[title*="Rich"]',
                '.fr-view',
                'textarea[name="message"]',
                'textarea#message',
                '.messageField textarea',
                '[contenteditable="true"]',
                '.ck-editor__editable',
                'textarea:last-of-type',
                'textarea'
            ];
            
            console.log('Поиск поля содержимого...');
            let contentField = null;
            let contentSelectorUsed = null;
            
            for (let i = 0; i < contentSelectors.length; i++) {
                const selector = contentSelectors[i];
                contentField = doc.querySelector(selector);
                if (contentField) {
                    contentSelectorUsed = selector;
                    console.log('Поле содержимого найдено:', selector);
                    break;
                }
            }
            
            if (contentField) {
                try {
                    console.log('Заполняем содержимое через:', contentSelectorUsed);
                    console.log('Content field type:', contentField.tagName);
                    console.log('ContentEditable:', contentField.contentEditable);
                    
                    // Если это iframe-редактор
                    if (contentField.tagName === 'IFRAME') {
                        console.log('Обрабатываем iframe редактор...');
                        try {
                            const iframeDoc = contentField.contentDocument || contentField.contentWindow.document;
                            const body = iframeDoc.querySelector('body') || iframeDoc.querySelector('[contenteditable]');
                            if (body) {
                                body.focus();
                                
                                // Очищаем содержимое
                                body.innerHTML = '';
                                
                                // Вставляем новое содержимое
                                body.innerHTML = content.replace(/\n/g, '<br>');
                                
                                // Множественные события
                                const events = ['input', 'change', 'keyup', 'blur', 'focus'];
                                events.forEach(eventType => {
                                    body.dispatchEvent(new Event(eventType, { bubbles: true }));
                                });
                                
                                console.log('iframe содержимое успешно заполнено');
                            } else {
                                console.log('iframe body не найден');
                            }
                        } catch (iframeError) {
                            console.error('Ошибка работы с iframe:', iframeError);
                        }
                    } 
                    // Обычное textarea
                    else if (contentField.tagName === 'TEXTAREA') {
                        console.log('Обрабатываем textarea...');
                        contentField.focus();
                        contentField.value = '';
                        contentField.value = content;
                        
                        const events = ['input', 'change', 'keyup', 'blur', 'focus'];
                        events.forEach(eventType => {
                            contentField.dispatchEvent(new Event(eventType, { bubbles: true }));
                        });
                        
                        console.log('Textarea содержимое успешно заполнено');
                    }
                    // Для contenteditable элементов
                    else if (contentField.contentEditable === 'true' || contentField.isContentEditable) {
                        console.log('Обрабатываем contentEditable...');
                        contentField.focus();
                        contentField.innerHTML = '';
                        contentField.innerHTML = content.replace(/\n/g, '<br>');
                        
                        const events = ['input', 'change', 'keyup', 'blur', 'focus'];
                        events.forEach(eventType => {
                            contentField.dispatchEvent(new Event(eventType, { bubbles: true }));
                        });
                        
                        console.log('ContentEditable содержимое успешно заполнено');
                    } else {
                        console.log('Неизвестный тип поля, пробуем как textarea');
                        contentField.focus();
                        if (contentField.value !== undefined) {
                            contentField.value = content;
                        } else {
                            contentField.innerHTML = content.replace(/\n/g, '<br>');
                        }
                        
                        const events = ['input', 'change', 'keyup'];
                        events.forEach(eventType => {
                            contentField.dispatchEvent(new Event(eventType, { bubbles: true }));
                        });
                    }
                } catch (contentError) {
                    console.error('Ошибка заполнения содержимого:', contentError);
                }
            } else {
                console.warn('Поле содержимого не найдено!');
                console.log('Доступные textarea:', doc.querySelectorAll('textarea').length);
                console.log('Доступные iframe:', doc.querySelectorAll('iframe').length);
                console.log('Доступные contenteditable:', doc.querySelectorAll('[contenteditable]').length);
            }
            
            // Попытка использовать Redactor API (если доступен)
            if (windowRef.$R) {
                try {
                    const redactorInstance = windowRef.$R('.redactor_BbCodeWysiwygEditor');
                    if (redactorInstance && redactorInstance.code) {
                        redactorInstance.code.set(content);
                    }
                } catch (redactorError) {
                    console.log('Ошибка Redactor API:', redactorError);
                }
            }
            
            // Подождём немного перед автоматической отправкой
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Автоматическая отправка формы
            const submitSelectors = [
                'button[name="do"][value="newthread"]',
                'input[type="submit"][value*="Создать"]',
                'input[type="submit"][value*="Отправить"]',
                'button[type="submit"]',
                'input[type="submit"]',
                'button.btn-primary',
                '.submitButton',
                'input[name="submit"]',
                'button[data-action="submit"]'
            ];
            
            let submitBtn = null;
            
            // Поиск кнопки отправки
            for (const selector of submitSelectors) {
                submitBtn = doc.querySelector(selector);
                if (submitBtn && submitBtn.offsetParent !== null) {
                    console.log(`Найдена кнопка отправки: ${selector}`);
                    break;
                }
            }
            
            // Автоматически нажимаем кнопку
            if (submitBtn) {
                setTimeout(() => {
                    try {
                        // Прокручиваем к кнопке
                        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Фокус и клик
                        submitBtn.focus();
                        submitBtn.click();
                        
                        console.log('Форма автоматически отправлена!');
                        
                        // Закрываем окно через некоторое время
                        setTimeout(() => {
                            if (windowRef && !windowRef.closed) {
                                windowRef.close();
                            }
                        }, 3000);
                        
                    } catch (clickError) {
                        console.error('Ошибка при клике:', clickError);
                    }
                }, 2000);
            } else {
                console.log('Кнопка отправки не найдена');
                
                // Пытаемся отправить через форму
                const form = doc.querySelector('form[method="post"]') || doc.querySelector('form');
                if (form) {
                    setTimeout(() => {
                        try {
                            form.submit();
                            console.log('Форма отправлена через form.submit()');
                            
                            setTimeout(() => {
                                if (windowRef && !windowRef.closed) {
                                    windowRef.close();
                                }
                            }, 3000);
                        } catch (formError) {
                            console.error('Ошибка при form.submit():', formError);
                        }
                    }, 2000);
                }
            }
            
        } catch (error) {
            console.error('Ошибка при заполнении формы:', error);
            // Пробуем альтернативные методы
            await this.alternativeFillMethods(windowRef, title, content);
        }
    }
    
    // Альтернативные методы заполнения (при CORS ограничениях)
    async alternativeFillMethods(windowRef, title, content) {
        console.log('Используем альтернативные методы...');
        
        try {
            // Метод 1: Копирование в буфер обмена
            const clipboardData = `${title}\n\n${content}`;
            await navigator.clipboard.writeText(clipboardData);
            console.log('Данные скопированы в буфер обмена');
            
            // Метод 2: PostMessage API (если окно на том же домене)
            try {
                windowRef.postMessage({
                    action: 'fillForm',
                    title: title,
                    content: content
                }, '*');
                console.log('Отправлено postMessage');
            } catch (postError) {
                console.log('PostMessage не сработал:', postError);
            }
            
            // Метод 3: Индивидуальная вставка через события клавиатуры
            setTimeout(async () => {
                try {
                    // Фокус на окне форума
                    windowRef.focus();
                    
                    // Программное нажатие Ctrl+V
                    this.simulateKeyboardPaste(windowRef);
                    
                    console.log('Попытка программной вставки');
                } catch (keyboardError) {
                    console.log('Ошибка программной вставки:', keyboardError);
                }
            }, 2000);
            
            // Метод 4: Показ инструкций
            this.showManualInstructions(title, content);
            
        } catch (error) {
            console.error('Ошибка альтернативных методов:', error);
        }
    }
    
    simulateKeyboardPaste(windowRef) {
        try {
            // Создаём событие клавиатуры Ctrl+V
            const pasteEvent = new KeyboardEvent('keydown', {
                key: 'v',
                code: 'KeyV',
                ctrlKey: true,
                bubbles: true
            });
            
            // Отправляем событие в окно
            if (windowRef.document) {
                windowRef.document.dispatchEvent(pasteEvent);
            }
        } catch (error) {
            console.log('Ошибка симуляции клавиш:', error);
        }
    }
    
    showManualInstructions(title, content) {
        // Показываем детальные инструкции для ручной вставки
        this.showNotification(
            `⚠️ Автозаполнение недоступно (браузерные ограничения).\nДанные скопированы! Нажмите Ctrl+V в полях формы.`,
            'warning'
        );
        
        console.log('📝 РУЧНАЯ ВСТАВКА ТРЕБУЕТСЯ:');
        console.log('Заголовок:', title);
        console.log('Содержимое:', content);
    }
    
    showSmartInstructions(formData, complaint) {
        console.log('🤖 ПОКАЗЫВАЕМ ИНСТРУКЦИИ ПОЛНОЙ АВТОМАТИЗАЦИИ');
        
        // Показываем уведомление о начале автоматизации
        this.showNotification(
            `🤖 ПОЛНАЯ АВТОМАТИЗАЦИЯ!\n🎯 ${complaint.violatorNickname}\n📝 Данные скопированы автоматически!\n✨ Программа пытается всё сделать сама`,
            'success'
        );
        
        // Показываем запасную схему на случай, если автоматизация не сработает
        setTimeout(() => {
            this.showNotification(
                `🛠️ ЕСЛИ НУЖНО - ДОСДЕЛАЙТЕ ВРУЧНУЮ:\n1️⃣ Нажмите в поле "Заголовок"\n2️⃣ Ctrl+V (вставить)\n3️⃣ Нажмите в основное поле\n4️⃣ Ctrl+A, Ctrl+V (заменить)\n5️⃣ Кнопка "Создать тему"`,
                'info'
            );
        }, 5000);
        
        this.playSound('success');
    }
    
    attemptForumInteraction(forumWindow, formData) {
        console.log('🚀 НАЧИНАЕМ ПОЛНОСТЬЮ АВТОМАТИЧЕСКУЮ ПОДАЧУ!');
        
        // Используем Electron IPC для системной автоматизации через nut-js
        this.executeAutomaticSubmissionViaIPC(forumWindow, formData);
    }
    
    async executeAutomaticSubmissionViaIPC(forumWindow, formData) {
        console.log('🤖 НАЧИНАЕМ ПОЛНОСТЬЮ АВТОМАТИЧЕСКУЮ ПОДАЧУ ЧЕРЕЗ IPC!');
        
        try {
            // Проверяем наличие Electron IPC
            if (!window.electron || !window.electron.ipcRenderer) {
                console.error('❌ Electron IPC не доступен');
                this.showNotification('Ошибка: Electron IPC не доступен', 'error');
                return;
            }

            // Получаем URL форума (используем server из formData или текущий сервер)
            const server = formData.server || this.currentServer;
            const affiliation = formData.affiliation || 'none';
            const forumUrl = this.getForumUrl(server, affiliation);
            if (!forumUrl) {
                console.error('❌ URL форума не найден', { server, affiliation });
                this.showNotification('Ошибка: URL форума не найден', 'error');
                return;
            }

            // Вызываем IPC handler для автоматизации (с автоматической установкой зависимостей)
            console.log('📡 Вызываем IPC handler для автоматизации...');
            
            // Показываем уведомление о начале процесса
            this.showNotification('🤖 Начинаем автоматическую подачу...', 'info');
            
            const result = await window.electron.ipcRenderer.invoke('automate-forum-submission', {
                title: formData.title,
                bbCode: formData.content,
                url: forumUrl,
                delay: 31000,
                autoInstall: true // Разрешаем автоматическую установку
            });

            if (result.success) {
                console.log('✅ Автоматическая подача успешно завершена!');
                this.showNotification('✅ Жалоба автоматически подана!', 'success');
                
                // Закрываем окно форума через некоторое время
                setTimeout(() => {
                    if (forumWindow && !forumWindow.closed) {
                        forumWindow.close();
                        console.log('💫 Окно форума закрыто');
                    }
                }, 5000);
            } else {
                console.error('❌ Ошибка автоматизации:', result.error);
                
                // Обрабатываем разные типы ошибок
                if (result.needsRestart) {
                    this.showNotification(
                        '⚠️ Модуль установлен! Пожалуйста, перезапустите приложение для применения изменений.',
                        'warning',
                        10000
                    );
                } else if (result.needsManualInstall) {
                    const installMessage = `❌ Требуется установка зависимостей.\n\n` +
                        `Для автоматической установки:\n` +
                        `1. Откройте терминал в папке приложения\n` +
                        `2. Выполните: npm install @nut-tree/nut-js\n` +
                        `3. Перезапустите приложение\n\n` +
                        `Или нажмите "Попробовать снова" для автоматической установки.`;
                    
                    if (confirm(installMessage + '\n\nПопробовать автоматическую установку сейчас?')) {
                        // Пробуем установить вручную через отдельный IPC вызов
                        this.showNotification('📦 Устанавливаем зависимости... Это может занять несколько минут.', 'info', 5000);
                        const installResult = await window.electron.ipcRenderer.invoke('check-and-install-nutjs');
                        
                        if (installResult.success || installResult.installed) {
                            this.showNotification('✅ Зависимости установлены! Перезапустите приложение.', 'success', 10000);
                        } else {
                            this.showNotification(`❌ Ошибка установки: ${installResult.error}`, 'error', 10000);
                        }
                    }
                } else {
                    this.showNotification(`Ошибка автоматизации: ${result.error}`, 'error', 10000);
                }
            }
        } catch (error) {
            console.error('❌ Критическая ошибка при автоматизации:', error);
            this.showNotification(`Критическая ошибка: ${error.message}`, 'error');
        }
    }
    
    executeNextStep() {
        if (this.automationStep >= this.automationSequence.length) {
            console.log('✅ Автоматическая подача завершена!');
            
            // Закрываем окно форума
            setTimeout(() => {
                if (this.forumWindowRef && !this.forumWindowRef.closed) {
                    this.forumWindowRef.close();
                    console.log('💫 Окно форума закрыто');
                }
            }, 2000);
            return;
        }
        
        const currentStep = this.automationSequence[this.automationStep];
        console.log(`➡️ Выполняем шаг ${this.automationStep + 1}/${this.automationSequence.length}`);
        
        try {
            currentStep();
        } catch (error) {
            console.error(`❌ Ошибка на шаге ${this.automationStep + 1}:`, error);
            this.automationStep++;
            setTimeout(() => this.executeNextStep(), 1000);
        }
    }
    
    copyAndPasteTitle() {
        console.log('📝 Копируем заголовок и вставляем на форум...');
        
        // 1. Убеждаемся, что наше окно в фокусе
        this.ensureFocusAndCopy(this.currentFormData.title, () => {
            console.log('✅ Заголовок скопирован');
            
            // 2. Переключаемся на окно форума
            this.switchToForumWindow();
            
            // 3. Вставляем через Ctrl+V
            setTimeout(() => {
                this.sendGlobalKeyCombo('ctrl+v');
                console.log('✅ Заголовок вставлен');
                
                // Переходим к следующему шагу
                this.automationStep++;
                setTimeout(() => this.executeNextStep(), 1000);
                
            }, 1500);
        });
    }
    
    copyAndPasteContent() {
        console.log('📝 Копируем BB-код и вставляем в основное поле...');
        
        // 1. Переключаемся обратно к нашей программе
        this.switchToMainWindow();
        
        setTimeout(() => {
            // 2. Копируем BB-код в буфер (с проверкой фокуса)
            this.ensureFocusAndCopy(this.currentFormData.content, () => {
                console.log('✅ BB-код скопирован');
                
                // 3. Переключаемся обратно на форум
                this.switchToForumWindow();
                
                setTimeout(() => {
                    // 4. Нажимаем Tab для перехода к основному полю
                    this.sendGlobalKey('Tab');
                    
                    setTimeout(() => {
                        // 5. Вставляем BB-код
                        this.sendGlobalKeyCombo('ctrl+v');
                        console.log('✅ BB-код вставлен');
                        
                        // Переходим к следующему шагу
                        this.automationStep++;
                        setTimeout(() => this.executeNextStep(), 1000);
                        
                    }, 1000);
                }, 1500);
            });
        }, 1000);
    }
    
    submitForumForm() {
        console.log('🚀 Отправляем форму...');
        
        // 1. Убеждаемся, что форум в фокусе
        this.switchToForumWindow();
        
        setTimeout(() => {
            // 2. Нажимаем Tab два раза для перехода к кнопке
            this.sendGlobalKey('Tab');
            
            setTimeout(() => {
                this.sendGlobalKey('Tab');
                
                setTimeout(() => {
                    // 3. Нажимаем Enter для отправки
                    this.sendGlobalKey('Enter');
                    console.log('✅ Форма отправлена!');
                    
                    // Завершаем автоматизацию
                    this.automationStep++;
                    setTimeout(() => this.executeNextStep(), 1000);
                    
                }, 500);
            }, 500);
        }, 1000);
    }
    
    executeSequence(targetWindow, sequence, index) {
        if (index >= sequence.length) {
            console.log('✅ Автоматическая последовательность завершена!');
            
            // Закрываем окно через 3 секунды
            setTimeout(() => {
                if (targetWindow && !targetWindow.closed) {
                    targetWindow.close();
                    console.log('💫 Окно форума закрыто');
                }
            }, 3000);
            return;
        }
        
        const step = sequence[index];
        console.log(`➡️ Шаг ${index + 1}/${sequence.length}: ${step.action} ${step.key || step.data || ''}`);
        
        try {
            if (step.action === 'key') {
                this.simulateKeyboardInput(targetWindow, step.key);
            } else if (step.action === 'paste') {
                this.simulateTextInput(targetWindow, step.data);
            }
        } catch (error) {
            console.error(`❌ Ошибка на шаге ${index + 1}:`, error);
        }
        
        // Переходим к следующему шагу
        setTimeout(() => {
            this.executeSequence(targetWindow, sequence, index + 1);
        }, step.delay || 500);
    }
    
    simulateKeyboardInput(targetWindow, key) {
        try {
            const keyEvent = new KeyboardEvent('keydown', {
                key: key,
                code: this.getKeyCode(key),
                bubbles: true,
                cancelable: true
            });
            
            if (targetWindow.document) {
                targetWindow.document.dispatchEvent(keyEvent);
                
                // Также отправляем keyup
                const keyUpEvent = new KeyboardEvent('keyup', {
                    key: key,
                    code: this.getKeyCode(key),
                    bubbles: true,
                    cancelable: true
                });
                targetWindow.document.dispatchEvent(keyUpEvent);
                
                console.log(`⌨️ Нажата клавиша: ${key}`);
            }
        } catch (error) {
            console.error(`⚠️ Ошибка симуляции клавиши ${key}:`, error);
        }
    }
    
    simulateTextInput(targetWindow, text) {
        try {
            // Метод 1: Попытка найти активный элемент
            if (targetWindow.document && targetWindow.document.activeElement) {
                const activeElement = targetWindow.document.activeElement;
                
                if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                    activeElement.value = text;
                    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log(`📝 Текст вставлен в ${activeElement.tagName}`);
                    return;
                }
                
                if (activeElement.contentEditable === 'true' || activeElement.isContentEditable) {
                    activeElement.innerHTML = text.replace(/\n/g, '<br>');
                    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log('📝 Текст вставлен в contentEditable');
                    return;
                }
            }
            
            // Метод 2: Симуляция Ctrl+V
            console.log('📝 Попытка вставки через буфер...');
            
            // Обновляем буфер обмена
            navigator.clipboard.writeText(text).then(() => {
                // Симулируем Ctrl+V
                const pasteEvent = new KeyboardEvent('keydown', {
                    key: 'v',
                    code: 'KeyV',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true
                });
                
                if (targetWindow.document) {
                    targetWindow.document.dispatchEvent(pasteEvent);
                    console.log('📝 Отправлен Ctrl+V');
                }
            });
            
        } catch (error) {
            console.error('⚠️ Ошибка вставки текста:', error);
        }
    }
    
    getKeyCode(key) {
        const keyCodes = {
            'Tab': 'Tab',
            'Enter': 'Enter',
            'Space': 'Space',
            'Escape': 'Escape'
        };
        return keyCodes[key] || key;
    }
    
    // Методы переключения между окнами
    switchToForumWindow() {
        console.log('🔄 Переключаемся на окно форума...');
        
        try {
            if (this.forumWindowRef && !this.forumWindowRef.closed) {
                this.forumWindowRef.focus();
                
                // Дополнительно пытаемся переместить окно на передний план
                setTimeout(() => {
                    if (this.forumWindowRef && !this.forumWindowRef.closed) {
                        this.forumWindowRef.focus();
                    }
                }, 100);
                
                console.log('✅ Окно форума в фокусе');
            } else {
                console.error('❌ Окно форума недоступно или закрыто');
            }
        } catch (error) {
            console.error('❌ Ошибка переключения на окно форума:', error);
        }
    }
    
    switchToMainWindow() {
        console.log('🔄 Переключаемся на основное окно...');
        
        try {
            window.focus();
            
            // Дополнительно пытаемся переместить на передний план
            setTimeout(() => {
                window.focus();
                document.body.focus();
            }, 100);
            
            console.log('✅ Основное окно в фокусе');
        } catch (error) {
            console.error('❌ Ошибка переключения на основное окно:', error);
        }
    }
    
    // Методы отправки глобальных клавиатурных событий
    sendGlobalKey(key) {
        console.log(`⌨️ Отправляем клавишу: ${key}`);
        
        try {
            // Отправляем событие в активное окно
            const keyDownEvent = new KeyboardEvent('keydown', {
                key: key,
                code: this.getKeyCode(key),
                bubbles: true,
                cancelable: true
            });
            
            const keyUpEvent = new KeyboardEvent('keyup', {
                key: key,
                code: this.getKeyCode(key),
                bubbles: true,
                cancelable: true
            });
            
            // Пытаемся отправить в активное окно
            if (this.forumWindowRef && !this.forumWindowRef.closed) {
                this.forumWindowRef.document.dispatchEvent(keyDownEvent);
                setTimeout(() => {
                    this.forumWindowRef.document.dispatchEvent(keyUpEvent);
                }, 50);
            } else {
                document.dispatchEvent(keyDownEvent);
                setTimeout(() => {
                    document.dispatchEvent(keyUpEvent);
                }, 50);
            }
            
        } catch (error) {
            console.error(`❌ Ошибка отправки клавиши ${key}:`, error);
        }
    }
    
    sendGlobalKeyCombo(combo) {
        console.log(`⌨️ Отправляем комбинацию: ${combo}`);
        
        try {
            if (combo === 'ctrl+v') {
                const pasteEvent = new KeyboardEvent('keydown', {
                    key: 'v',
                    code: 'KeyV',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true
                });
                
                const pasteEventUp = new KeyboardEvent('keyup', {
                    key: 'v',
                    code: 'KeyV',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true
                });
                
                // Пытаемся отправить в активное окно
                if (this.forumWindowRef && !this.forumWindowRef.closed) {
                    this.forumWindowRef.document.dispatchEvent(pasteEvent);
                    setTimeout(() => {
                        this.forumWindowRef.document.dispatchEvent(pasteEventUp);
                    }, 50);
                } else {
                    document.dispatchEvent(pasteEvent);
                    setTimeout(() => {
                        document.dispatchEvent(pasteEventUp);
                    }, 50);
                }
            }
            
        } catch (error) {
            console.error(`❌ Ошибка отправки комбинации ${combo}:`, error);
        }
    }
    
    getForumUrl(server, affiliation) {
        const links = {
            '1': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-сост-в-организациях.194/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-гос-структурах.195/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-криминальных-структурах.196/create-thread'
            },
            '12': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-состоящих-во-фракциях.534/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-гос-структурах.535/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-бандах.536/create-thread'
            }
        };
        
        return links[server]?.[affiliation];
    }
    
    showForumInstructions(windowRef) {
        // Показываем инструкции пользователю
        const instructions = `
        🎆 АВТОМАТИЧЕСКАЯ ПОДАЧА RADMIR 🎆\n\n
        ⚙️ Система автоматически заполняет форму!\n\n
        🔄 Процесс обработки:\n
        • Заполняем заголовок автоматически\n
        • Вставляем BB-код в основное поле\n
        • Нажимаем кнопку отправки\n
        • Закрываем окно автоматически\n\n
        ⏱️ Следующая жалоба через 31 секунд\n
        ⏹️ Можно остановить в любой момент\n\n
        ⚠️ Не закрывайте окно до завершения отправки!
        `;
        
        // Показываем алерт через некоторое время
        setTimeout(() => {
            try {
                if (windowRef && !windowRef.closed) {
                    windowRef.alert(instructions);
                }
            } catch (error) {
                // Игнорируем CORS ошибки
            }
        }, 1000);
    }
    
    // Дополнительные утилиты для автоподачи
    addAutoSubmitToHistory() {
        // Добавляем кнопку быстрой автоподачи в историю
        const historyHeader = document.querySelector('.history-controls');
        if (historyHeader && !document.getElementById('quickAutoSubmit')) {
            const quickButton = document.createElement('button');
            quickButton.id = 'quickAutoSubmit';
            quickButton.className = 'btn btn-warning';
            quickButton.innerHTML = '<i class="fas fa-rocket"></i> Быстрая автоподача';
            quickButton.addEventListener('click', () => {
                this.switchTab('autosubmit');
                setTimeout(() => {
                    document.getElementById('loadQueue').click();
                }, 500);
            });
            historyHeader.appendChild(quickButton);
        }
    }
    
    // Queue Management Methods
    toggleQueueItem(index) {
        // Ищем в currentSubmissionQueue или autoSubmitQueue
        const complaint = (this.currentSubmissionQueue || []).find(c => c.queueIndex === index) ||
                         (this.autoSubmitQueue || []).find(c => c.queueIndex === index);
        if (complaint) {
            complaint.selected = !complaint.selected;
            this.renderSubmitQueue();
        }
    }
    
    selectAllQueueItems() {
        const queue = this.currentSubmissionQueue || this.autoSubmitQueue || [];
        queue.forEach(complaint => {
            complaint.selected = true;
        });
        this.renderSubmitQueue();
    }
    
    deselectAllQueueItems() {
        const queue = this.currentSubmissionQueue || this.autoSubmitQueue || [];
        queue.forEach(complaint => {
            complaint.selected = false;
        });
        this.renderSubmitQueue();
    }
    
    removeSelectedFromQueue() {
        const selectedCount = this.autoSubmitQueue.filter(c => c.selected).length;
        
        if (selectedCount === 0) {
            this.showNotification('Ничего не выбрано', 'warning');
            return;
        }
        
        if (confirm(`Удалить ${selectedCount} выбранных жалоб из очереди?`)) {
            this.autoSubmitQueue = this.autoSubmitQueue.filter(c => !c.selected);
            
            // Перенумеровываем индексы
            this.autoSubmitQueue.forEach((complaint, index) => {
                complaint.queueIndex = index;
            });
            
            this.renderSubmitQueue();
            this.showSuccess(`Удалено ${selectedCount} жалоб из очереди`);
            this.playSound('success');
            
            // Обновляем индекс текущей обработки
            if (this.currentSubmitIndex >= this.autoSubmitQueue.length) {
                this.currentSubmitIndex = 0;
            }
        }
    }
    
    clearSubmitQueue() {
        if (this.autoSubmitQueue.length === 0) {
            this.showNotification('Очередь уже пуста', 'info');
            return;
        }
        
        if (confirm(`Очистить всю очередь (${this.autoSubmitQueue.length} жалоб)?`)) {
            this.autoSubmitQueue = [];
            this.currentSubmitIndex = 0;
            
            this.renderSubmitQueue();
            this.showSuccess('Очередь очищена');
            this.playSound('success');
            
            // Скрываем кнопку запуска
            document.getElementById('startAutoSubmit').style.display = 'none';
        }
    }
    
    updateRemoveButton() {
        const selectedCount = this.autoSubmitQueue.filter(c => c.selected).length;
        const removeBtn = document.getElementById('removeSelected');
        
        if (removeBtn) {
            removeBtn.disabled = selectedCount === 0;
            removeBtn.innerHTML = `<i class="fas fa-minus-circle"></i> Удалить выбранные ${selectedCount > 0 ? `(${selectedCount})` : ''}`;
        }
    }
    
    // ===========================================
    // AutoHotkey Integration Methods
    // ===========================================
    
    // Подготовка данных для AutoHotkey
    // Новая логика:
    // 1) Если в истории есть жалобы без submitted=true → готовим файл для ВСЕХ таких жалоб.
    // 2) Если истории нет → работаем как раньше только с текущей формой.
    prepareAHKData() {
        // Пытаемся сначала взять все неопубликованные жалобы из истории
        const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
        const unpublished = complaints.filter(c => !c.submitted);

        if (unpublished.length > 0) {
            // Готовим единый complaint_data.txt для всех неопубликованных жалоб
            this.writeAHKMultiDataFile(unpublished);
            this.updateAHKStatus('ready', `✅ Подготовлены данные для AutoHotkey по ${unpublished.length} жалобам из истории`);
            this.showSuccess(`📄 Подготовлены AHK данные для ${unpublished.length} жалоб из истории (неопубликованные).`);
            return;
        }

        // Если в истории нет жалоб — старое поведение: только текущая форма
        const formData = this.getFormData();

        if (!this.validateForm(formData)) {
            this.showError('', 'Заполните все обязательные поля перед подготовкой AHK данных');
            return;
        }

        const bbCode = this.generateBBCode(formData);

        // Общий заголовок для всех жалоб из вкладки "Автоподача"
        const submitTitleInput = document.getElementById('submitTitle');
        const commonTitle = submitTitleInput ? submitTitleInput.value.trim() : '';
        const autoTitle = `Жалоба на игрока ${formData.violatorNickname} (${formData.violation})`;
        const finalTitle = commonTitle || autoTitle;

        const customUrlInput = document.getElementById('ahkCustomUrl');
        const customUrl = customUrlInput ? customUrlInput.value.trim() : '';

        const forumURL = customUrl || this.getForumUrl(formData.server, formData.affiliation);

        if (!forumURL) {
            this.showError('affiliation', 'Выберите принадлежность нарушителя или укажите ссылку форума для AHK');
            return;
        }

        this.writeAHKDataFile(finalTitle, bbCode, forumURL);
        this.updateAHKStatus('ready', '✅ Данные готовы для AutoHotkey');
        this.showSuccess('📄 Данные подготовлены для AutoHotkey! Запустите скрипт с F1');
    }
    
    // Запуск AutoHotkey скрипта
    // По запросу: при нажатии кнопки "Запустить AHK скрипт"
    // открываем файл test.ahk из папки "Загрузки" относительно index.html
    // (../../Downloads/test.ahk от корня проекта в C:/Users/<user>/Projects/...)
    launchAHKScript() {
        try {
            const ahkPath = '../../Downloads/test.ahk';

            // Пытаемся открыть файл в новом окне/вкладке.
            // Браузер либо предложит открыть его системным AHK, либо скачать.
            const win = window.open(ahkPath, '_blank');

            if (!win) {
                // Если popup заблокирован
                this.updateAHKStatus('error', '❌ Браузер заблокировал открытие test.ahk. Откройте его вручную из папки Загрузки.');
                this.showNotification('Браузер заблокировал открытие test.ahk. Откройте файл вручную из папки Загрузки.', 'warning');
                return;
            }

            this.updateAHKStatus('processing', '🚀 Открываем test.ahk из папки Загрузки. Если браузер скачал файл снова, запустите его вручную.');
            this.showNotification('Если файл test.ahk скачался повторно, запустите его из папки Загрузки.', 'info');
        } catch (error) {
            console.error('Ошибка запуска AHK:', error);
            this.updateAHKStatus('error', '❌ Не удалось открыть test.ahk. Запустите его вручную из папки Загрузки.');
        }
    }
    
    // Тест AutoHotkey
    testAHK() {
        // Создаем тестовые данные
        const testTitle = 'Тестовая жалоба AHK';
        const testContent = '[CENTER][FONT=Book Antiqua][SIZE=6]\\n\\n🔥 ТЕСТ AUTOHOTKEY ИНТЕГРАЦИИ 🔥\\n\\nЭто тестовое сообщение для проверки AutoHotkey скрипта.\\nЕсли вы видите это сообщение, значит интеграция работает!\\n\\n[/SIZE][/FONT][/CENTER]';

        // Для теста тоже уважаем кастомный URL, если он задан
        const customUrlInput = document.getElementById('ahkCustomUrl');
        const customUrl = customUrlInput ? customUrlInput.value.trim() : '';

        const defaultTestURL = 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-сост-в-организациях.194/create-thread';
        const testURL = customUrl || defaultTestURL;

        // Записываем тестовые данные
        this.writeAHKDataFile(testTitle, testContent, testURL);
        
        // Обновляем статус
        this.updateAHKStatus('ready', '🧪 Тестовые данные готовы. Нажмите F3 в AHK скрипте');
        
        // Показываем инструкции
        this.showNotification('🧪 Тестовые данные подготовлены!\nЗапустите autosubmit.ahk и нажмите F3 для тестирования', 'info', 5000);
    }
    
    // Открытие лог файла AHK
    openAHKLog() {
        // Создаем ссылку для скачивания лог файла
        const logContent = 'Лог файл AutoHotkey будет создан после запуска скрипта.\n\nДля просмотра логов:\n1. Запустите autosubmit.ahk\n2. Выполните любое действие\n3. Найдите файл autosubmit_log.txt в папке проекта';
        
        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ahk_log_info.txt';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        this.showNotification('📄 Инструкции по логам скачаны. Запустите AHK скрипт для создания реальных логов.', 'info');
    }
    
    // Запись данных в файл для AutoHotkey (одна жалоба)
    writeAHKDataFile(title, content, url) {
        const dataContent = `TITLE=${title}\nCONTENT=${content.replace(/\n/g, "\\n")}\nURL=${url}`;
        
        this.downloadAHKDataFile(dataContent);
        
        console.log('📄 AHK data file created (single):', {
            title: title,
            contentLength: content.length,
            url: url
        });
    }

    // Запись данных в файл для AutoHotkey (несколько жалоб)
    // Формат блока:
    // TITLE=...
    // CONTENT=...
    // URL=...
    //
    // ===
    // (следующий блок)
    writeAHKMultiDataFile(complaintsForExport) {
        const customUrlInput = document.getElementById('ahkCustomUrl');
        const customUrl = customUrlInput ? customUrlInput.value.trim() : '';

        // Общий заголовок для всех жалоб из вкладки "Автоподача"
        const submitTitleInput = document.getElementById('submitTitle');
        const commonTitle = submitTitleInput ? submitTitleInput.value.trim() : '';

        const blocks = [];

        const complaintsArray = Array.isArray(complaintsForExport) ? complaintsForExport : [];

        complaintsArray.forEach((complaint) => {
            // Генерируем BB-код по тем же правилам, что и в форме
            const bbCode = this.generateBBCode(complaint);
            const title = commonTitle || `Жалоба на игрока ${complaint.violatorNickname} (${complaint.violation})`;

            // Для каждой жалобы определяем URL: либо общий customUrl, либо по серверу/типу
            const url = customUrl || this.getForumUrl(complaint.server, complaint.affiliation);

            if (!url) {
                console.warn('AHK multi-data: пропускаю жалобу без URL', complaint);
                return;
            }

            const encodedContent = bbCode.replace(/\n/g, '\\n');

            const block = `TITLE=${title}\nCONTENT=${encodedContent}\nURL=${url}\n`;
            blocks.push(block);
        });

        if (blocks.length === 0) {
            this.showNotification('Нет жалоб с корректным URL для подготовки AHK данных', 'warning');
            return;
        }

        const dataContent = blocks.join('\n===\n\n');

        this.downloadAHKDataFile(dataContent);

        console.log('📄 AHK multi data file created:', {
            complaintsCount: blocks.length,
        });
    }

    // Общий helper для скачивания complaint_data.txt
    downloadAHKDataFile(dataContent) {
        const blob = new Blob([dataContent], { type: 'text/plain;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'complaint_data.txt';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(downloadUrl);
    }

    // Подготовка данных только для выбранных элементов очереди
    prepareSelectedAHKData() {
        if (!this.currentSubmissionQueue || this.currentSubmissionQueue.length === 0) {
            this.showNotification('Очередь пуста. Сначала нажмите "Выборочная подача" и загрузите историю.', 'warning');
            return;
        }

        const selected = this.currentSubmissionQueue.filter(item => item.selected);

        if (selected.length === 0) {
            this.showNotification('Не выбрано ни одной жалобы в очереди.', 'warning');
            return;
        }

        this.writeAHKMultiDataFile(selected);
        this.updateAHKStatus('ready', `✅ Подготовлены данные для ${selected.length} выбранных жалоб`);
        this.showSuccess(`📄 Подготовлены AHK данные для ${selected.length} выбранных жалоб.`);
    }
    
    // Получение URL форума
    getForumUrl(server, affiliation) {
        const links = {
            '1': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-сост-в-организациях.194/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-гос-структурах.195/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-сост-в-криминальных-структурах.196/create-thread'
            },
            '12': {
                'none': 'https://forum.radmir.games/forums/Жалобы-на-игроков-не-состоящих-во-фракциях.534/create-thread',
                'org': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-гос-структурах.535/create-thread',
                'gang': 'https://forum.radmir.games/forums/Жалобы-на-игроков-состоящих-в-бандах.536/create-thread'
            }
        };
        
        return links[server]?.[affiliation] || null;
    }
    
    // Обновление статуса AHK
    updateAHKStatus(type, message) {
        const statusElement = document.getElementById('ahkStatus');
        if (!statusElement) return;
        
        // Удаляем предыдущие классы статуса
        statusElement.className = 'ahk-status';
        
        // Добавляем новый класс только если он не пустой
        if (type && type.trim()) {
            statusElement.classList.add(type);
        }
        statusElement.textContent = message || '';
    }
    
    // Показ инструкций для запуска AHK
    showAHKLaunchInstructions() {
        const instructions = `
            <div class="alert alert-warning ahk-launch-info" style="margin-top: 1rem;">
                <h5>🔧 Обновленные инструкции AutoHotkey</h5>
                <div class="alert alert-danger mb-3">
                    <strong>❗ ВАЖНО:</strong> Используйте НОВЫЙ файл!
                </div>
                <div class="mb-3">
                    <strong>Новые инструкции:</strong>
                    <ol>
                        <li>Закройте старый <code>autosubmit.ahk</code> если он запущен</li>
                        <li>Запустите <code><strong>autosubmit_working.ahk</strong></code> в папке проекта</li>
                        <li>Должно появиться окно "AutoHotkey Ready"</li>
                        <li>Нажмите <kbd>F3</kbd> для теста</li>
                        <li>Нажмите <kbd>F1</kbd> для автоматизации</li>
                    </ol>
                </div>
                <div class="alert alert-success">
                    📄 Прочтите файл <strong>ФИНАЛЬНОЕ_ИСПРАВЛЕНИЕ.txt</strong> для подробных инструкций
                </div>
                <div class="text-center">
                    <button class="btn btn-outline-warning btn-sm" onclick="this.parentElement.remove()">Понятно 👍</button>
                </div>
            </div>
        `;
        
        const container = document.getElementById('ahkStatus').parentElement;
        if (container) {
            // Удаляем предыдущие инструкции
            const existing = container.querySelector('.ahk-launch-info');
            if (existing) existing.remove();
            
            const instructionsDiv = document.createElement('div');
            instructionsDiv.innerHTML = instructions;
            container.appendChild(instructionsDiv);
        }
    }
    
    // Инициализация AutoSubmit вкладки
    loadAutoSubmitTab() {
        // Обновляем статус при открытии вкладки
        this.updateAHKStatus('', 'Нажмите "Подготовить AHK данные" для начала');
        
        // Инициализируем autoSubmitQueue если он не существует
        if (!this.autoSubmitQueue) {
            this.autoSubmitQueue = [];
        }
        
        // Загружаем очередь автоподачи если есть
        if (this.autoSubmitQueue.length > 0) {
            this.renderSubmitQueue();
        }
    }
    
    // Проверка файлов автоподачи
    async checkAutosubmitFiles() {
        console.log('checkAutosubmitFiles called');
        try {
            if (!window.electron || !window.electron.ipcRenderer) {
                console.error('IPC not available');
                this.showNotification('IPC недоступен. Убедитесь, что приложение запущено через Electron.', 'error');
                return;
            }
            
            console.log('Calling check-autosubmit-files IPC');
            const filesInfo = await window.electron.ipcRenderer.invoke('check-autosubmit-files');
            console.log('Files info received:', filesInfo);
            
            if (filesInfo.error) {
                this.showNotification(`Ошибка проверки файлов: ${filesInfo.error}`, 'error');
                return;
            }
            
            const dataFileStatus = filesInfo.dataFile.exists 
                ? `✅ Существует (${filesInfo.dataFile.size} байт)` 
                : '❌ Не найден';
            const ahkScriptStatus = filesInfo.ahkScript.exists 
                ? `✅ Существует (${filesInfo.ahkScript.size} байт)` 
                : '❌ Не найден';
            
            let contentPreview = '';
            if (filesInfo.dataFile.exists && filesInfo.dataFile.content) {
                contentPreview = `\n\nПервые 200 символов:\n${filesInfo.dataFile.content}`;
            }
            
            this.showNotification(
                `📁 Проверка файлов:\n\n` +
                `Папка: ${filesInfo.dataDir}\n\n` +
                `Файл данных: ${dataFileStatus}\n` +
                `Путь: ${filesInfo.dataFile.path}${contentPreview}\n\n` +
                `AutoHotkey скрипт: ${ahkScriptStatus}\n` +
                `Путь: ${filesInfo.ahkScript.path}`,
                filesInfo.dataFile.exists && filesInfo.ahkScript.exists ? 'success' : 'warning',
                20000
            );
        } catch (error) {
            console.error('Error checking files:', error);
            this.showNotification(`Ошибка при проверке файлов: ${error.message}`, 'error');
        }
    }
    
    // Открытие папки с файлами автоподачи
    async openAutosubmitFolder() {
        console.log('openAutosubmitFolder called');
        try {
            if (!window.electron || !window.electron.ipcRenderer) {
                console.error('IPC not available');
                this.showNotification('IPC недоступен. Убедитесь, что приложение запущено через Electron.', 'error');
                return;
            }
            
            console.log('Calling open-autosubmit-folder IPC');
            const result = await window.electron.ipcRenderer.invoke('open-autosubmit-folder');
            console.log('Open folder result:', result);
            
            if (result.success) {
                this.showNotification(`📁 Папка открыта:\n${result.path}`, 'success', 5000);
            } else {
                this.showNotification(`Ошибка открытия папки: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error opening folder:', error);
            this.showNotification(`Ошибка при открытии папки: ${error.message}`, 'error');
        }
    }
    
    // Встроенная авто-подача
    async startBuiltinAutoSubmit() {
        console.log('=== START BUILTIN AUTO SUBMIT ===');
        
        // Используем currentSubmissionQueue или autoSubmitQueue
        let queue = this.currentSubmissionQueue && this.currentSubmissionQueue.length > 0
            ? this.currentSubmissionQueue
            : this.autoSubmitQueue || [];
        
        console.log('Queue length:', queue.length);
        
        // Если есть выбранные жалобы, используем только их (выборочная подача)
        const selectedComplaints = queue.filter(c => c.selected);
        if (selectedComplaints.length > 0) {
            queue = selectedComplaints;
            console.log('Using selected complaints:', selectedComplaints.length);
            this.showNotification(`✅ Выборочная подача: ${selectedComplaints.length} выбранных жалоб`, 'info');
        } else if (queue.length > 0) {
            // Если ничего не выбрано, но есть очередь - предупреждаем
            if (!confirm(`Не выбрано ни одной жалобы. Отправить все ${queue.length} жалоб из очереди?`)) {
                return;
            }
        }
            
        if (queue.length === 0) {
            this.showNotification('Очередь пуста! Загрузите жалобы (кнопка "Выборочная подача") и отметьте нужные чекбоксами.', 'warning');
            return;
        }
        
        const title = document.getElementById('submitTitle')?.value || 'Жалоба на администрацию';
        if (!title) {
            this.showNotification('Введите заголовок для всех жалоб!', 'warning');
            return;
        }
        
        console.log('Title:', title);
        console.log('Queue items:', queue.map(q => ({ violator: q.violatorNickname, server: q.server })));
        
        if (!confirm(`Начать полностью автоматическую подачу ${queue.length} жалоб?\n\nПриложение автоматически:\n1. Откроет форму в системном браузере\n2. Вставит заголовок (Ctrl+V)\n3. Нажмет TAB\n4. Вставит BB-код (Ctrl+V)\n5. Нажмет TAB 2 раза\n6. Нажмет Enter для отправки\n7. Подождет 31 секунду перед следующей жалобой\n\nВНИМАНИЕ: Не используйте мышь и клавиатуру во время работы!\n\nГотовы начать?`)) {
            return;
        }
        
        // Показываем кнопку остановки
        document.getElementById('startAutoSubmitBuiltin')?.style.setProperty('display', 'none');
        document.getElementById('stopAutoSubmitBuiltin')?.style.setProperty('display', 'block');
        
        this.autoSubmitRunning = true;
        this.autoSubmitProcessed = 0;
        this.autoSubmitTotal = queue.length;
        
        this.updateAutoSubmitStatus('Запущена', this.autoSubmitProcessed, this.autoSubmitTotal);
        
        // Обрабатываем каждую жалобу
        for (let i = 0; i < queue.length && this.autoSubmitRunning; i++) {
            const complaint = queue[i];
            
            try {
                // Генерируем BB-код
                const bbCode = this.generateBBCode(complaint);
                
                // Получаем URL форума
                const forumUrl = this.getForumUrl(complaint.server, complaint.affiliation);
                if (!forumUrl) {
                    this.showNotification(`Пропущена жалоба ${i + 1}: не найден URL для сервера ${complaint.server}`, 'warning');
                    continue;
                }
                
                this.updateAutoSubmitStatus(`Обработка жалобы ${i + 1}/${queue.length}...`, i, queue.length);
                
                // Вызываем IPC для автоматизации через nut-js (полностью автоматическая подача)
                if (window.electron && window.electron.ipcRenderer) {
                    this.updateAutoSubmitStatus(`Автоматическая подача ${i + 1}/${queue.length}...`, i, queue.length);
                    
                    // Показываем предупреждение перед началом
                    if (i === 0) {
                        this.showNotification(
                            `🚀 ПОЛНОСТЬЮ АВТОМАТИЧЕСКАЯ ПОДАЧА НАЧАЛАСЬ!\n\n🤖 Приложение автоматически:\n• Откроет форму в браузере\n• Вставит заголовок и BB-код\n• Отправит форму\n• Подождет 31 секунду перед следующей\n\n⚠️ НЕ ИСПОЛЬЗУЙТЕ мышь и клавиатуру во время работы!`,
                            'info',
                            15000
                        );
                    }
                    
                    console.log('Calling automate-forum-submission IPC:', {
                        title: title ? title.substring(0, 50) : 'NO TITLE',
                        bbCodeLength: bbCode ? bbCode.length : 0,
                        url: forumUrl || 'NO URL'
                    });
                    
                    const result = await window.electron.ipcRenderer.invoke('automate-forum-submission', {
                        title: title,
                        bbCode: bbCode,
                        url: forumUrl,
                        delay: 31000, // 31 секунда между жалобами
                        autoInstall: true // Разрешаем автоматическую установку nut-js
                    });
                    
                    console.log('IPC result:', result);
                    
                    if (result.success) {
                        this.autoSubmitProcessed++;
                        this.updateAutoSubmitStatus(`✅ Жалоба ${i + 1}/${queue.length} подана!`, i + 1, queue.length);
                        
                        // Ждем кулдаун перед следующей жалобой
                        if (i < queue.length - 1) {
                            this.showNotification(
                                `✅ Жалоба ${i + 1}/${queue.length} успешно подана!\n\n⏱️ Кулдаун 31 секунда перед следующей...`,
                                'success',
                                5000
                            );
                            // Ждем кулдаун перед следующей жалобой
                            await new Promise(resolve => setTimeout(resolve, 31000));
                        } else {
                            this.updateAutoSubmitStatus(`Все жалобы поданы!`, this.autoSubmitProcessed, queue.length);
                            this.showNotification(`✅ Последняя жалоба ${i + 1}/${queue.length} успешно подана!`, 'success', 5000);
                        }
                    } else {
                        const errorMsg = result.error || 'Unknown error';
                        const errorStack = result.stack ? `\n\nДетали:\n${result.stack}` : '';
                        console.error('Auto-submit failed:', errorMsg, errorStack);
                        
                        // Обрабатываем разные типы ошибок
                        if (result.needsRestart) {
                            this.showNotification(
                                `⚠️ Модуль установлен! Перезапустите приложение для применения изменений.`,
                                'warning',
                                10000
                            );
                            break;
                        } else if (result.needsManualInstall) {
                            const errorDetails = result.error || 'Неизвестная ошибка';
                            const manualInstallMsg = `❌ Требуется установка зависимостей.\n\n` +
                                `Ошибка: ${errorDetails}\n\n` +
                                `Попробовать автоматическую установку сейчас?\n\n` +
                                `Если автоматическая установка не работает, установите вручную:\n` +
                                `1. Откройте командную строку\n` +
                                `2. Перейдите в папку приложения:\n` +
                                `   cd "C:\\Users\\Даник\\Projects\\FOR\\release\\ComplaintApp-win32-x64\\resources\\app"\n` +
                                `3. Выполните: npm install @nut-tree/nut-js\n` +
                                `4. Перезапустите приложение`;
                            
                            if (confirm(manualInstallMsg)) {
                                this.showNotification('📦 Устанавливаем зависимости... Это может занять несколько минут.', 'info', 5000);
                                const installResult = await window.electron.ipcRenderer.invoke('check-and-install-nutjs');
                                
                                if (installResult.success || installResult.installed) {
                                    this.showNotification('✅ Зависимости установлены! Перезапустите приложение.', 'success', 10000);
                                } else {
                                    this.showNotification(
                                        `❌ Ошибка установки: ${installResult.error}\n\n` +
                                        `Попробуйте установить вручную через командную строку.`,
                                        'error',
                                        15000
                                    );
                                }
                            }
                            break;
                        } else {
                            this.showNotification(`❌ Ошибка при подаче жалобы ${i + 1}:\n${errorMsg}${errorStack}`, 'error', 10000);
                        }
                    }
                } else {
                    this.showNotification('IPC недоступен. Убедитесь, что приложение запущено через Electron.', 'error');
                    break;
                }
            } catch (error) {
                console.error('Auto-submit error:', error);
                this.showNotification(`Ошибка при обработке жалобы ${i + 1}: ${error.message}`, 'error');
            }
        }
        
        // Завершение
        this.autoSubmitRunning = false;
        document.getElementById('startAutoSubmitBuiltin')?.style.setProperty('display', 'block');
        document.getElementById('stopAutoSubmitBuiltin')?.style.setProperty('display', 'none');
        
        if (this.autoSubmitProcessed === this.autoSubmitTotal) {
            this.updateAutoSubmitStatus('Завершена успешно!', this.autoSubmitProcessed, this.autoSubmitTotal);
            this.showSuccess(`Авто-подача завершена! Обработано: ${this.autoSubmitProcessed}/${this.autoSubmitTotal}`);
        } else {
            this.updateAutoSubmitStatus('Остановлена', this.autoSubmitProcessed, this.autoSubmitTotal);
            this.showNotification(`Авто-подача остановлена. Обработано: ${this.autoSubmitProcessed}/${this.autoSubmitTotal}`, 'info');
        }
    }
    
    stopBuiltinAutoSubmit() {
        if (confirm('Остановить авто-подачу?')) {
            this.autoSubmitRunning = false;
            document.getElementById('startAutoSubmitBuiltin')?.style.setProperty('display', 'block');
            document.getElementById('stopAutoSubmitBuiltin')?.style.setProperty('display', 'none');
            this.updateAutoSubmitStatus('Остановлена пользователем', this.autoSubmitProcessed, this.autoSubmitTotal);
        }
    }
    
    updateAutoSubmitStatus(status, processed, total) {
        const statusText = document.getElementById('autoSubmitStatusText');
        const processedEl = document.getElementById('autoSubmitProcessed');
        const totalEl = document.getElementById('autoSubmitTotal');
        
        if (statusText) statusText.textContent = status;
        if (processedEl) processedEl.textContent = processed;
        if (totalEl) totalEl.textContent = total;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.complaintGenerator = new ComplaintGenerator();
});