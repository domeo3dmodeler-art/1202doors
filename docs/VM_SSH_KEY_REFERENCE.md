# Какой SSH-ключ использовать для ВМ

## ВМ 178.154.244.83 — рабочая машина (domeo-app, Nginx, фото)

По умолчанию скрипты используют ключ из **docs/VM_158_160_10_126_DEPLOY.md**:

- **Путь:** `%USERPROFILE%\.ssh\ssh-key-1773410153319\ssh-key-1773410153319`
- **Проверка:** `ssh -i "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319" -o StrictHostKeyChecking=no ubuntu@178.154.244.83 "echo OK"`

Если при настройке «одна ВМ» (**docs/DEPLOY_ODNA_VM.md**) на сервер был добавлен ключ **1002doors-vm**:

- **Путь:** `%USERPROFILE%\.ssh\1002doors-vm\id_ed25519`
- **Задать перед запуском:** `$env:1002DOORS_SSH_KEY = "$env:USERPROFILE\.ssh\1002doors-vm\id_ed25519"`

## Если получаете Permission denied (publickey)

1. Подключитесь к ВМ тем ключом, которым получается: `ssh -i путь\к\ключу ubuntu@178.154.244.83`.
2. Задайте этот же путь в переменной и запустите скрипт снова:
   ```powershell
   $env:1002DOORS_SSH_KEY = "C:\полный\путь\к\приватному_ключу"
   .\scripts\run-photo-setup-full.ps1
   ```

Скрипты (`apply-nginx-to-vm.ps1`, `sync-uploads-to-vm.ps1`, `run-photo-setup-full.ps1`) читают ключ из `$env:1002DOORS_SSH_KEY`; если переменная не задана — используется путь `...\ssh-key-1773410153319\ssh-key-1773410153319`.
