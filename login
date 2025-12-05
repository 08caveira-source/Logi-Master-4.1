<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOGIN | LOGIMASTER</title>
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body class="login-body">

    <div class="login-container">
        <div class="login-header">
            <h1>LOGI<span style="color:var(--primary-color);">MASTER</span></h1>
            <p>GESTÃO DE FROTAS</p>
        </div>
        
        <form id="formLogin">
            <div class="form-group">
                <label for="email"><i class="fas fa-envelope"></i> E-MAIL</label>
                <input type="email" id="email" required placeholder="admin@empresa.com">
            </div>
            <div class="form-group">
                <label for="password"><i class="fas fa-lock"></i> SENHA</label>
                <input type="password" id="password" required placeholder="********">
            </div>
            
            <div id="loginError" style="color:var(--danger-color); text-align:center; margin-bottom:15px; display:none; font-weight:bold;">
                E-MAIL OU SENHA INCORRETOS.
            </div>

            <button type="submit" class="btn-primary" style="width:100%; justify-content:center; padding:15px;">
                ENTRAR NO SISTEMA
            </button>
        </form>
        <div style="text-align:center; margin-top:20px; font-size:0.8rem; color:#777;">
            &copy; LOGIMASTER 2024 - ACESSO RESTRITO
        </div>
    </div>

    <!-- FIREBASE CONFIG & LÓGICA DE LOGIN -->
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

        // MESMA CONFIGURAÇÃO DO SEU INDEX.HTML
        const firebaseConfig = {
            apiKey: "AIzaSyBZjVdcyjbEoR_-X6_lZuTRDMeN2wIntZI",
            authDomain: "logi-master-dd4cd.firebaseapp.com",
            projectId: "logi-master-dd4cd",
            storageBucket: "logi-master-dd4cd.firebasestorage.app",
            messagingSenderId: "673000154258",
            appId: "1:673000154258:web:fc9d6fced43e557076324b"
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);

        // Se já estiver logado, manda pro sistema direto
        onAuthStateChanged(auth, (user) => {
            if (user) {
                window.location.href = "index.html";
            }
        });

        // Lógica do Formulário
        document.getElementById('formLogin').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('loginError');
            const btn = e.target.querySelector('button');

            try {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ENTRANDO...';
                btn.disabled = true;
                errorDiv.style.display = 'none';

                await signInWithEmailAndPassword(auth, email, password);
                // O redirecionamento acontece automaticamente pelo onAuthStateChanged acima
            } catch (error) {
                console.error("Erro login:", error);
                errorDiv.style.display = 'block';
                errorDiv.textContent = "LOGIN FALHOU: VERIFIQUE E-MAIL E SENHA.";
                btn.innerHTML = 'ENTRAR NO SISTEMA';
                btn.disabled = false;
            }
        });
    </script>
</body>
</html>