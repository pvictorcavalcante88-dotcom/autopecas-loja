/* ==============================================================
   🚀 SCRIPT GERAL DO SITE (Versão Final: Parceiro + Carrinho)
   ============================================================== */

// CONFIGURAÇÕES GLOBAIS
const API_URL = ''; // Vazio = usa o mesmo domínio
let FATOR_PRECO = 1.0; // Padrão: 1.0 (Preço Original). Muda se o afiliado logar.

// --- FUNÇÕES UTILITÁRIAS ---

// Formata R$ aplicando a margem do parceiro (se houver)
function formatarMoeda(valorBase) {
    if (valorBase == null || isNaN(valorBase)) return 'R$ 0,00';
    const valorFinal = valorBase * FATOR_PRECO;
    return Number(valorFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Pega carrinho do Storage com segurança
function getCarrinho() {
    try { return JSON.parse(localStorage.getItem('nossoCarrinho') || '[]'); } 
    catch (e) { return []; }
}

// ==============================================================
// 🏁 INICIALIZAÇÃO (QUANDO A PÁGINA CARREGA)
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    console.log("🚀 Script Iniciado");

    // [NOVO] 1. VERIFICAÇÃO DE AFILIADO LOGADO (MODO PARCEIRO)
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    
    if (afiliadoLogado) {
        // Se tem parceiro logado, ele define o preço!
        const margemSalva = parseFloat(localStorage.getItem('minhaMargem') || 0);
        
        // Define o Fator Global de Preço (IMPORTANTE)
        FATOR_PRECO = 1 + (margemSalva / 100);
        
        console.log(`🦊 Modo Parceiro Ativado: ${afiliadoLogado.nome} (Margem: ${margemSalva}%)`);
        
        // Chama a função visual (que cria a barra preta)
        ativarModoParceiro(afiliadoLogado);
    }

    // 2. LÓGICA DE RESTAURAÇÃO (LINK DO PDF/ORÇAMENTO)
    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 
    const refCode = paramsURL.get('ref');

    if (restoreData) {
        console.log("🔄 Tentando restaurar carrinho do link...");
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            
            if (Array.isArray(itensResgatados)) {
                localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
                console.log("✅ Carrinho restaurado:", itensResgatados);
            }
            // Salva Afiliado do Link se existir
            if (refCode) localStorage.setItem('afiliadoCodigo', refCode);

        } catch (e) {
            console.error("❌ Erro ao ler link:", e);
        }
    }

    // 3. Atualiza Ícone do Carrinho (Bolinha vermelha)
    atualizarIconeCarrinho();

    // 4. Roteamento Inteligente (Executa funções baseado na página atual)
    const path = window.location.pathname;

    if (path.includes('checkout.html')) {
        console.log("💳 Página de Checkout detectada.");
        await carregarPaginaCheckout();
        setupCheckoutEvents();
    } 
    else if (path.includes('cart.html')) {
        carregarPaginaCarrinho();
    }
    else if (path.includes('product.html')) {
        setupProductPage();
    }
    else if (path.includes('busca.html') || path.includes('search')) {
        setupSearchPage();
    }

    // 5. Eventos Globais (Busca no Topo e Slider)
    setupGlobalSearch();

    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    if (typeof iniciarSlider === 'function') iniciarSlider();
});


/* ==============================================================
   🛒 LÓGICA DO CARRINHO (CART.HTML)
   ============================================================== */
async function carregarPaginaCarrinho() {
    console.log("🏁 Carregando Carrinho...");
    
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');

    // Se não achar a tabela, para o código (estamos em outra página)
    if (!cartItemsContainer) return;

    let cart = getCarrinho(); // Usa 'nossoCarrinho'
    
    // Limpa a tabela
    cartItemsContainer.innerHTML = ''; 

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Seu carrinho está vazio.</td></tr>';
        if (cartTotalElement) cartTotalElement.innerText = 'R$ 0,00';
        return;
    }

    let total = 0;

    // Loop nos itens
    for (const item of cart) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            
            if (!response.ok) continue; // Pula se não achar o produto

            const product = await response.json();

            // Dados Seguros (PT ou EN)
            const nome = product.name || product.titulo || 'Produto';
            const precoBase = parseFloat(product.price || product.preco_novo || 0);
            const imagem = product.image || product.imagem || 'https://via.placeholder.com/50';
            const qtd = item.quantidade || item.quantity || 1; 

            // Aplica a Margem do Parceiro (FATOR_PRECO já foi calculado lá no inicio)
            const precoFinal = precoBase * FATOR_PRECO;
            const subtotal = precoFinal * qtd;
            total += subtotal;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <img src="${imagem}" alt="${nome}" width="60" style="border-radius:4px; object-fit: cover;">
                </td>
                <td>${nome}</td>
                <td>${Number(precoFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px; justify-content: center;">
                        <button onclick="alterarQuantidade(${item.id}, -1)" type="button" style="padding: 5px 10px; cursor: pointer;">-</button>
                        <span style="font-weight: bold;">${qtd}</span>
                        <button onclick="alterarQuantidade(${item.id}, 1)" type="button" style="padding: 5px 10px; cursor: pointer;">+</button>
                    </div>
                </td>
                <td style="font-weight: bold;">${Number(subtotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>
                    <button onclick="removerItem(${item.id})" style="color: red; border: none; background: none; cursor: pointer; font-size: 1.2rem;">&times;</button>
                </td>
            `;
            cartItemsContainer.appendChild(row);

        } catch (error) {
            console.error("Erro item carrinho:", error);
        }
    }

    // Atualiza Total Geral
    if (cartTotalElement) {
        cartTotalElement.innerText = Number(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
}

function alterarQuantidade(id, delta) {
    let cart = getCarrinho();
    const item = cart.find(p => p.id === id);
    
    if (item) {
        let qtdAtual = item.quantidade || item.quantity || 1;
        item.quantidade = qtdAtual + delta;
        delete item.quantity; // Limpa chave antiga se existir

        if (item.quantidade <= 0) {
            cart = cart.filter(p => p.id !== id);
        }

        localStorage.setItem('nossoCarrinho', JSON.stringify(cart));
        carregarPaginaCarrinho();
        atualizarIconeCarrinho();
    }
}

function removerItem(id) {
    let cart = getCarrinho();
    cart = cart.filter(p => p.id !== id);
    localStorage.setItem('nossoCarrinho', JSON.stringify(cart));
    carregarPaginaCarrinho();
    atualizarIconeCarrinho();
}


/* ==============================================================
   💳 LÓGICA DO CHECKOUT (CHECKOUT.HTML)
   ============================================================== */
async function carregarPaginaCheckout() {
    const listaResumo = document.querySelector('.summary-item-list');
    const btnFinalizar = document.querySelector('.btn-place-order');
    const totalEl = document.getElementById('cart-total');

    if (!listaResumo) return;

    const carrinho = getCarrinho();
    
    if (carrinho.length === 0) {
        listaResumo.innerHTML = '<p style="color:red;">Carrinho vazio.</p>';
        if(btnFinalizar) btnFinalizar.disabled = true;
        return;
    }

    listaResumo.innerHTML = '<p>Calculando...</p>';
    
    let html = '';
    let subtotal = 0;
    let itensValidos = [];

    for (const item of carrinho) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`); // Ajuste para rota correta
            if (!response.ok) continue;

            const p = await response.json();
            
            // Dados seguros
            const titulo = p.name || p.titulo;
            const imagem = p.image || p.imagem;
            const precoBase = parseFloat(p.price || p.preco_novo);
            
            // Aplica Margem
            const precoFinal = precoBase * FATOR_PRECO;
            const totalItem = precoFinal * item.quantidade;

            subtotal += totalItem;
            itensValidos.push({ id: p.id, quantidade: item.quantidade });

            html += `
            <div class="summary-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${imagem}" style="width:40px;">
                    <span>(${item.quantidade}x) ${titulo}</span>
                </div>
                <strong>${Number(totalItem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>
            </div>`;

        } catch (e) { console.error(e); }
    }

    listaResumo.innerHTML = html;
    if(totalEl) totalEl.textContent = Number(subtotal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

    if(btnFinalizar) {
        btnFinalizar.dataset.itens = JSON.stringify(itensValidos);
        btnFinalizar.disabled = false;
        btnFinalizar.textContent = "Finalizar Pedido";
    }
}

function setupCheckoutEvents() {
    const btn = document.querySelector('.btn-place-order');
    if(btn) btn.addEventListener('click', finalizarPedido);
}

async function finalizarPedido() {
    const btn = document.querySelector('.btn-place-order');
    const email = document.getElementById('email').value;
    const rua = document.getElementById('rua').value;
    
    if(!email || !rua) return alert("Preencha todos os campos!");

    // Se tiver parceiro logado, usa o código dele. Se não, usa o refCode da URL/Storage
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    const afiliadoCodigo = afiliadoLogado ? afiliadoLogado.codigo : localStorage.getItem('afiliadoCodigo');

    btn.textContent = "Enviando..."; 
    btn.disabled = true;

    try {
        const body = {
            cliente: { nome: email, email: email, endereco: rua },
            itens: JSON.parse(btn.dataset.itens),
            afiliadoCodigo: afiliadoCodigo
        };

        const res = await fetch(`${API_URL}/finalizar-pedido`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if(!res.ok) throw new Error(data.erro || 'Erro ao processar');

        alert(`Pedido #${data.id} realizado com sucesso!`);
        localStorage.removeItem('nossoCarrinho');
        window.location.href = 'index.html';

    } catch (e) {
        alert("Erro: " + e.message);
        btn.textContent = "Tentar Novamente"; 
        btn.disabled = false;
    }
}


/* ==============================================================
   📦 LÓGICA DE PRODUTOS E BUSCA
   ============================================================== */
function setupProductPage() {
    const pId = new URLSearchParams(window.location.search).get('id');
    if(pId) {
        buscarProdutoPorId(pId);
        const btn = document.querySelector('.btn-add-cart');
        if(btn) btn.addEventListener('click', () => {
            adicionarAoCarrinho(pId, parseInt(document.getElementById('quantity-input').value || 1));
            alert('Adicionado ao carrinho!');
        });
    }
}

async function buscarProdutoPorId(id) {
    try {
        const res = await fetch(`${API_URL}/products/${id}`);
        const p = await res.json();
        
        // Atualiza HTML
        document.getElementById('product-title').textContent = p.name || p.titulo;
        document.getElementById('main-product-image').src = p.image || p.imagem || '';
        
        // Aplica Margem do Parceiro
        const precoBase = parseFloat(p.price || p.preco_novo);
        document.getElementById('product-price-new').textContent = formatarMoeda(precoBase);
        
        if((p.quantity || p.estoque) > 0) {
            document.querySelector('.btn-add-cart').disabled = false;
        }
    } catch(e) {}
}

function adicionarAoCarrinho(id, qtd) {
    let c = getCarrinho();
    let item = c.find(i => i.id == id);
    
    if(item) {
        let q = item.quantidade || item.quantity || 0;
        item.quantidade = q + qtd;
        delete item.quantity;
    } else {
        c.push({ id: parseInt(id), quantidade: qtd });
    }
    
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
}

function atualizarIconeCarrinho() {
    const tot = getCarrinho().reduce((a,b) => a + (b.quantidade||b.quantity||0), 0);
    const icon = document.querySelector('.cart-button span:last-child');
    if(icon) { 
        icon.textContent = tot; 
        icon.style.display = tot > 0 ? 'grid' : 'none'; 
    }
}

// --- BUSCA ---
function setupGlobalSearch() {
    const btn = document.getElementById('search-button');
    const input = document.getElementById('search-input');
    if(btn && input) {
        btn.addEventListener('click', () => { if(input.value) window.location.href = `busca.html?q=${input.value}`; });
        input.addEventListener('keypress', (e) => { if(e.key==='Enter' && input.value) window.location.href = `busca.html?q=${input.value}`; });
    }
}

function setupSearchPage() {
    const q = new URLSearchParams(window.location.search).get('q');
    if(q) executarBusca(q);
}

async function executarBusca(q) {
    try {
        const res = await fetch(`${API_URL}/search?q=${q}`); // Certifique-se que rota existe no server
        const data = await res.json();
        const track = document.getElementById("search-track");
        
        if(track) {
            track.innerHTML = '';
            data.forEach(p => {
                const titulo = p.name || p.titulo;
                const img = p.image || p.imagem;
                const preco = parseFloat(p.price || p.preco_novo);
                
                track.innerHTML += `
                <a href="product.html?id=${p.id}" class="product-card">
                    <div class="product-image"><img src="${img}"></div>
                    <h3>${titulo}</h3>
                    <p class="price-new">${formatarMoeda(preco)}</p>
                </a>`;
            });
        }
    } catch(e) {}
}

function iniciarSlider() { /* ...seu código de slider... */ }


/* ==============================================================
   🦊 FUNÇÕES DO MODO PARCEIRO (Barra Preta e Controle de Margem)
   ============================================================== */
function ativarModoParceiro(afiliado) {
    // 1. Muda o botão "Entrar" para "Sair"
    const btnLogin = document.getElementById('btn-login-header');
    if (btnLogin) {
        btnLogin.innerHTML = `<i class="ph ph-sign-out"></i><span>Sair</span>`;
        btnLogin.href = "#";
        btnLogin.style.color = "#e67e22"; 
        btnLogin.onclick = (e) => {
            e.preventDefault();
            if(confirm(`Olá ${afiliado.nome}, deseja sair do modo parceiro?`)) {
                localStorage.removeItem('afiliadoLogado');
                localStorage.removeItem('minhaMargem'); 
                window.location.reload();
            }
        };
    }

    // 2. Cria a BARRA DE COMANDO
    const margemAtual = localStorage.getItem('minhaMargem') || 0;
    
    const barra = document.createElement('div');
    barra.id = "barra-parceiro";
    barra.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 50px;
        background: #2c3e50; color: white; 
        z-index: 99999; display: flex; justify-content: center; align-items: center; gap: 15px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-family: sans-serif;
    `;
    
    barra.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:bold; color:#f39c12;">🦊 ${afiliado.nome}</span>
        </div>
        <div style="height: 20px; width: 1px; background: #555;"></div>
        <div style="display:flex; align-items:center; gap:5px; background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px;">
            <label style="font-size: 0.85rem; color:#ddd;">Comissão:</label>
            <input type="number" id="input-margem" value="${margemAtual}" min="0" max="100" 
                style="width:50px; padding:4px; border-radius:4px; border:none; text-align:center; font-weight:bold; color:#2c3e50;">
            <span style="font-weight:bold; font-size:0.9rem;">%</span>
        </div>
        <button id="btn-aplicar-margem" style="background:#27ae60; color:white; border:none; padding:6px 15px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 0.8rem;">
            APLICAR
        </button>
    `;

    document.body.prepend(barra); 
    document.body.style.paddingTop = "50px"; 

    // 3. Ação do Botão Aplicar
    document.getElementById('btn-aplicar-margem').addEventListener('click', async () => {
        const novaMargem = parseFloat(document.getElementById('input-margem').value);
        if(isNaN(novaMargem) || novaMargem < 0) return alert("Valor inválido.");

        localStorage.setItem('minhaMargem', novaMargem);
        
        // Tenta salvar no servidor para persistência (opcional)
        try {
            if(afiliado.token) {
                await fetch('/afiliado/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${afiliado.token}` },
                    body: JSON.stringify({ novaMargem })
                });
            }
        } catch(e) {}
        
        alert(`Comissão atualizada para ${novaMargem}%!`);
        window.location.reload(); 
    });
}