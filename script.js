// ==============================================================
// CONFIGURAÇÕES GLOBAIS
// ==============================================================
// Vazio significa: "Use o mesmo endereço onde estou agora"
const API_URL = '';
let FATOR_PRECO = 1.0; // Margem do Afiliado (Padrão 1.0 = sem aumento)

// Formata R$
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
// INICIALIZAÇÃO (QUANDO A PÁGINA ABRE)
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    console.log("🚀 Script Iniciado");

    // 1. LÓGICA DE RESTAURAÇÃO (LINK DO PDF)
    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 
    const refCode = paramsURL.get('ref');

    if (restoreData) {
        console.log("🔄 Tentando restaurar carrinho do link...");
        try {
            // Decodifica e Salva
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            
            if (Array.isArray(itensResgatados)) {
                localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
                console.log("✅ Carrinho salvo na memória:", itensResgatados);
            } else {
                console.error("❌ Dados do link não são uma lista válida.");
            }

            // Salva Afiliado
            if (refCode) localStorage.setItem('afiliadoCodigo', refCode);

        } catch (e) {
            console.error("❌ Erro crítico ao ler link:", e);
            alert("Erro ao ler o link do orçamento. Tente gerar novamente.");
        }
    }

    // 2. Configura Margem do Afiliado
    const codigoFinal = refCode || localStorage.getItem('afiliadoCodigo');
    if (codigoFinal) {
        localStorage.setItem('afiliadoCodigo', codigoFinal);
        await atualizarMargemAfiliado(codigoFinal);
    }
    
    // 3. Atualiza Ícone
    atualizarIconeCarrinho();

    // 4. Roteamento Inteligente (Carrega as funções da página atual)
    const path = window.location.pathname;

    if (path.includes('checkout.html')) {
        // FORÇA O CARREGAMENTO DO CHECKOUT AGORA
        console.log("💳 Página de Checkout detectada. Iniciando...");
        await carregarPaginaCheckout(); // <--- AQUI ESTÁ A CORREÇÃO
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

    // Eventos Globais (Busca no Topo)
    setupGlobalSearch();

    // Home (Carrossel e Promos)
    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    if (typeof iniciarSlider === 'function') iniciarSlider();
});


// ==============================================================
// FUNÇÃO CHECKOUT BLINDADA (Onde estava o erro)
// ==============================================================
async function carregarPaginaCheckout() {
    console.log("⚙️ Executando carregarPaginaCheckout...");
    
    const listaResumo = document.querySelector('.summary-item-list');
    const btnFinalizar = document.querySelector('.btn-place-order');
    const totalEl = document.getElementById('cart-total');

    if (!listaResumo) return console.log("⚠️ Elemento summary-item-list não achado.");

    // 1. Verifica Carrinho
    const carrinho = getCarrinho();
    console.log("📦 Itens no carrinho:", carrinho);

    if (carrinho.length === 0) {
        listaResumo.innerHTML = '<p style="padding:10px; color:red;">Seu carrinho está vazio.</p>';
        if(totalEl) totalEl.textContent = 'R$ 0,00';
        if(btnFinalizar) { btnFinalizar.disabled = true; btnFinalizar.textContent = "Carrinho Vazio"; }
        return;
    }

    listaResumo.innerHTML = '<p style="padding:10px;">Carregando preços atualizados...</p>';
    
    let html = '';
    let subtotal = 0;
    let itensValidos = [];

    // 2. Loop de Produtos
    for (const item of carrinho) {
        try {
            console.log(`🔍 Buscando produto ID: ${item.id}`);
            const response = await fetch(`${API_URL}/produtos/${item.id}`);
            
            if (!response.ok) {
                console.warn(`👻 Produto ID ${item.id} não encontrado (404). Ignorando.`);
                continue; // Pula pro próximo, não trava
            }

            const p = await response.json();
            
            // Cálculo Seguro
            const precoBase = parseFloat(p.preco_novo);
            const precoFinal = precoBase * FATOR_PRECO;
            const totalItem = precoFinal * item.quantidade;

            subtotal += totalItem;
            itensValidos.push({ id: p.id, quantidade: item.quantidade });

            html += `
            <div class="summary-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${p.imagem || 'https://via.placeholder.com/50'}" style="width:40px; height:40px; object-fit:contain;">
                    <span style="font-size:0.9rem;">(${item.quantidade}x) ${p.titulo}</span>
                </div>
                <strong>${Number(totalItem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>
            </div>`;

        } catch (erro) {
            console.error(`❌ Erro ao processar item ${item.id}:`, erro);
        }
    }

    // 3. Renderização Final
    console.log("✅ Loop finalizado. Renderizando...");
    
    if (itensValidos.length === 0) {
        listaResumo.innerHTML = '<p>Nenhum produto válido encontrado.</p>';
        subtotal = 0;
    } else {
        listaResumo.innerHTML = html;
    }

    if(totalEl) totalEl.textContent = Number(subtotal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

    if(btnFinalizar) {
        if (subtotal > 0) {
            btnFinalizar.dataset.itens = JSON.stringify(itensValidos);
            btnFinalizar.dataset.total = subtotal; // Envia pro backend, mas ele recalcula
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = "Finalizar Pedido";
            btnFinalizar.style.background = 'var(--accent-color)';
        } else {
            btnFinalizar.disabled = true;
        }
    }
}

function setupCheckoutEvents() {
    const btn = document.querySelector('.btn-place-order');
    if(btn) btn.addEventListener('click', finalizarPedido);
}

// ==============================================================
// OUTRAS FUNÇÕES DO SISTEMA (MANTIDAS)
// ==============================================================

async function atualizarMargemAfiliado(codigo) {
    try {
        const res = await fetch(`${API_URL}/afiliado/check/${codigo}`);
        const data = await res.json();
        if (data.margem) {
            FATOR_PRECO = 1 + (data.margem / 100);
            console.log(`💹 Margem aplicada: +${data.margem}%`);
        }
    } catch (e) { console.log("Erro margem, usando padrão."); }
}

async function finalizarPedido() {
    const btn = document.querySelector('.btn-place-order');
    const email = document.getElementById('email').value;
    const rua = document.getElementById('rua').value;
    
    if(!email || !rua) return alert("Por favor, preencha Email e Endereço.");

    const afiliadoCodigo = localStorage.getItem('afiliadoCodigo');
    btn.textContent = "Processando..."; btn.disabled = true;

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

        alert(`Sucesso! Pedido #${data.id} realizado.`);
        localStorage.removeItem('nossoCarrinho');
        
        // Limpa URL para evitar re-compras acidentais
        window.location.href = 'index.html';

    } catch (e) {
        alert("Erro: " + e.message);
        btn.textContent = "Tentar Novamente"; btn.disabled = false;
    }
}

// --- CARRINHO E PRODUTOS ---
function setupProductPage() {
    const pId = new URLSearchParams(window.location.search).get('id');
    if(pId) {
        buscarProdutoPorId(pId);
        const btn = document.querySelector('.btn-add-cart');
        if(btn) btn.addEventListener('click', () => {
            if(btn.disabled) return;
            adicionarAoCarrinho(pId, parseInt(document.getElementById('quantity-input').value || 1));
            alert('Adicionado ao carrinho!');
        });
    }
}

async function buscarProdutoPorId(id) {
    try {
        const res = await fetch(`${API_URL}/produtos/${id}`);
        const p = await res.json();
        document.getElementById('product-title').textContent = p.titulo;
        document.getElementById('main-product-image').src = p.imagem || '';
        document.getElementById('product-price-new').textContent = formatarMoeda(p.preco_novo);
        if(p.estoque > 0) {
            document.querySelector('.btn-add-cart').disabled = false;
            document.getElementById('stock-status').textContent = `Disponível (${p.estoque})`;
            document.getElementById('stock-status').style.color = 'green';
        }
    } catch(e) {}
}

function adicionarAoCarrinho(id, qtd) {
    let c = getCarrinho();
    let item = c.find(i=>i.id==id);
    if(item) item.quantidade += qtd; else c.push({id:parseInt(id), quantidade:qtd});
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
}
function atualizarIconeCarrinho() {
    const tot = getCarrinho().reduce((a,b)=>a+b.quantidade,0);
    const icon = document.querySelector('.cart-button span:last-child');
    if(icon) { icon.textContent=tot; icon.style.display=tot>0?'grid':'none'; }
}

// --- BUSCA GLOBAL ---
function setupGlobalSearch() {
    const btn = document.getElementById('search-button');
    const input = document.getElementById('search-input');
    if(btn && input) {
        btn.addEventListener('click', () => irParaBusca(input.value));
        input.addEventListener('keypress', (e) => { if(e.key==='Enter') irParaBusca(input.value); });
    }
}
function irParaBusca(termo) {
    if(termo) window.location.href = `busca.html?q=${termo}`;
}

// --- PÁGINA DE BUSCA ---
function setupSearchPage() {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    if(q) executarBusca(q);
}
async function executarBusca(q) {
    try {
        const res = await fetch(`${API_URL}/search?q=${q}`);
        const data = await res.json();
        const track = document.getElementById("search-track");
        if(track) {
            track.innerHTML = '';
            data.forEach(p => {
                track.innerHTML += `<a href="product.html?id=${p.id}" class="product-card">
                    <div class="product-image"><img src="${p.imagem}"></div>
                    <h3>${p.titulo}</h3><p class="price-new">${formatarMoeda(p.preco_novo)}</p>
                </a>`;
            });
        }
    } catch(e) {}
}

// --- CARROSSEL (Copiado do anterior) ---
let slideIndex = 0;
function iniciarSlider() {
    const slides = document.querySelectorAll('.slide');
    if (slides.length > 0) {
        slides[0].classList.add('active');
        setInterval(() => mudarSlide(1), 5000);
    }
}
function mudarSlide(n) {
    const slides = document.querySelectorAll('.slide');
    if(slides.length===0) return;
    slides.forEach(s => s.classList.remove('active'));
    slideIndex = (slideIndex + n + slides.length) % slides.length;
    slides[slideIndex].classList.add('active');
}

/* =======================================================
   🛒 LÓGICA DO CARRINHO (CORRIGIDA: USO DO 'nossoCarrinho')
   ======================================================= */

async function carregarPaginaCarrinho() {
    console.log("🏁 Iniciando carregamento do carrinho...");
    
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');

    // Se não achar a tabela, para o código (estamos em outra página)
    if (!cartItemsContainer) return;

    // 1. CORREÇÃO CRÍTICA: Usando 'nossoCarrinho' em vez de 'cart'
    let cart = JSON.parse(localStorage.getItem('nossoCarrinho')) || [];
    
    // 2. Limpa a tabela
    cartItemsContainer.innerHTML = ''; 

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Seu carrinho está vazio.</td></tr>';
        if (cartTotalElement) cartTotalElement.innerText = 'R$ 0,00';
        return;
    }

    let total = 0;

    // 3. Loop nos itens
    for (const item of cart) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            
            if (!response.ok) {
                console.warn(`Produto ID ${item.id} não encontrado.`);
                continue; 
            }

            const product = await response.json();

            // Tradutor de campos (Português/Inglês)
            const nome = product.name || product.titulo || 'Produto';
            const preco = parseFloat(product.price || product.preco_novo || 0);
            const imagem = product.image || product.imagem || 'https://via.placeholder.com/50';
            
            // CORREÇÃO: Pega a quantidade certa
            const qtd = item.quantidade || item.quantity || 1; 

            // Aplica a margem do afiliado se tiver (usando sua função global)
            // Se FATOR_PRECO não estiver definido, usa 1
            const fator = (typeof FATOR_PRECO !== 'undefined') ? FATOR_PRECO : 1.0;
            const precoFinal = preco * fator;
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
            console.error("Erro ao processar item:", error);
        }
    }

    // Atualiza Total
    if (cartTotalElement) {
        cartTotalElement.innerText = Number(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
}

// --- Funções Auxiliares (Também corrigidas para 'nossoCarrinho') ---

function alterarQuantidade(id, delta) {
    let cart = JSON.parse(localStorage.getItem('nossoCarrinho')) || [];
    const item = cart.find(p => p.id === id);
    
    if (item) {
        // Normaliza
        let qtdAtual = item.quantidade || item.quantity || 1;
        let novaQtd = qtdAtual + delta;

        // Atualiza mantendo o padrão 'quantidade' (que seu checkout usa)
        item.quantidade = novaQtd;
        // Remove a chave antiga se existir pra não confundir
        delete item.quantity; 

        if (novaQtd <= 0) {
            cart = cart.filter(p => p.id !== id);
        }

        localStorage.setItem('nossoCarrinho', JSON.stringify(cart));
        
        carregarPaginaCarrinho();
        if (typeof atualizarIconeCarrinho === 'function') atualizarIconeCarrinho();
    }
}

function removerItem(id) {
    let cart = JSON.parse(localStorage.getItem('nossoCarrinho')) || [];
    cart = cart.filter(p => p.id !== id);
    localStorage.setItem('nossoCarrinho', JSON.stringify(cart));
    
    carregarPaginaCarrinho();
    if (typeof atualizarIconeCarrinho === 'function') atualizarIconeCarrinho();
}

// O Event Listener já está no topo do seu script, não precisa repetir aqui.