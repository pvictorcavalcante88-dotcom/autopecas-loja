/* ==============================================================
   🚀 SCRIPT GERAL DO SITE (Versão Final: Debug + Carrinho + Parceiro)
   ============================================================== */

// CONFIGURAÇÕES GLOBAIS
const API_URL = ''; // Vazio = usa o mesmo domínio (Render)
let FATOR_PRECO = 1.0; // Padrão

// --- FUNÇÕES UTILITÁRIAS ---

// Formata valor para Real
function formatarMoeda(valorBase) {
    if (valorBase == null || isNaN(valorBase)) return 'R$ 0,00';
    const valorFinal = valorBase * FATOR_PRECO;
    return Number(valorFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Pega carrinho do Storage
function getCarrinho() {
    try { return JSON.parse(localStorage.getItem('nossoCarrinho') || '[]'); } 
    catch (e) { return []; }
}

// Atualiza a bolinha vermelha do carrinho (A FUNÇÃO QUE ESTAVA FALTANDO)
function atualizarIconeCarrinho() {
    const carrinho = getCarrinho();
    const totalItens = carrinho.reduce((acc, item) => acc + (item.quantidade || 1), 0);
    
    // Procura o span dentro do botão do carrinho no header do seu HTML
    const icon = document.querySelector('.cart-button span:last-child');
    
    if(icon) {
        icon.textContent = totalItens;
        // Só mostra se tiver item
        icon.style.display = totalItens > 0 ? 'flex' : 'none'; 
        // Garante que o display seja flex ou grid para centralizar o numero
        if(totalItens > 0) icon.style.display = 'grid';
    }
}

// ==============================================================
// 🏁 INICIALIZAÇÃO (QUANDO A PÁGINA CARREGA)
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    console.log("🚀 Script Iniciado");

    // 1. MODO PARCEIRO (Se for o Vendedor Logado)
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (afiliadoLogado) {
        const margemSalva = parseFloat(localStorage.getItem('minhaMargem') || 0);
        FATOR_PRECO = 1 + (margemSalva / 100);
        console.log(`🦊 Parceiro Logado: ${afiliadoLogado.nome} (+${margemSalva}%)`);
        ativarModoParceiro(afiliadoLogado);
    } 
    else {
        // 2. MODO CLIENTE (Verifica se veio por link de afiliado)
        const paramsURL = new URLSearchParams(window.location.search);
        const refCode = paramsURL.get('ref') || localStorage.getItem('afiliadoCodigo');

        if (refCode) {
            localStorage.setItem('afiliadoCodigo', refCode);
            await carregarMargemDoCodigo(refCode);
        }
    }

    // 3. RECUPERAÇÃO DE CARRINHO VIA LINK (PDF)
    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 
    
    if (restoreData) {
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            if (Array.isArray(itensResgatados)) {
                localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.error("Erro link:", e); }
    }

    // 4. INICIALIZAÇÃO DAS PÁGINAS
    atualizarIconeCarrinho(); // <--- Agora ela existe e vai funcionar!
    
    const path = window.location.pathname;

    if (path.includes('checkout.html')) {
        await carregarPaginaCheckout();
    } 
    else if (path.includes('cart.html')) {
        carregarPaginaCarrinho();
    }
    else if (path.includes('product.html')) {
        setupProductPage();
    }
    else if (path.includes('busca.html') || path.includes('search')) {
        setupSearchPage(); // Função com DEBUG
    }

    // Configura a busca global (Lupa e Categorias)
    setupGlobalSearch(); // Função com DEBUG

    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    if (typeof iniciarSlider === 'function') iniciarSlider();
});


/* ==============================================================
   🕵️‍♂️ BUSCA COM DEBUG (ESPIÃO ATIVADO)
   ============================================================== */

// 1. Configura a Lupa e chama o rastreador de categorias
function setupGlobalSearch() {
    console.log("🔍 [DEBUG] Iniciando configuração da busca...");
    
    const btn = document.getElementById('search-button');
    const input = document.getElementById('search-input');
    
    if (!input) console.error("❌ [DEBUG] ERRO: Input 'search-input' não encontrado!");
    if (!btn) console.error("❌ [DEBUG] ERRO: Botão 'search-button' não encontrado!");

    if(btn && input) {
        // Clique na Lupa
        btn.onclick = (e) => { 
            console.log("🖱️ [DEBUG] Clique na Lupa detectado.");
            e.preventDefault(); 
            fazerPesquisa(input.value, ''); 
        };

        // Apertar Enter
        input.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') {
                console.log("⌨️ [DEBUG] Enter pressionado.");
                e.preventDefault();
                fazerPesquisa(input.value, '');
            }
        });
    }

    // Configura os cards de categoria
    setupCategoryLinks();
}

// 2. O Espião nos Cards de Categoria
function setupCategoryLinks() {
    // Procura todos os elementos com a classe .category-card
    const linksCategoria = document.querySelectorAll('.category-card'); 
    
    console.log(`📊 [DEBUG] Encontrei ${linksCategoria.length} cards de categoria.`);

    if (linksCategoria.length === 0) {
        console.warn("⚠️ [DEBUG] ALERTA: Nenhum card de categoria encontrado.");
        return;
    }

    const input = document.getElementById('search-input');

    linksCategoria.forEach((link, index) => {
        link.addEventListener('click', (e) => {
            const textoDigitado = input ? input.value.trim() : '';
            
            // Pega o nome da categoria (do data-categoria ou do texto dentro do span)
            let categoriaNome = link.dataset.categoria;
            if (!categoriaNome) {
                const span = link.querySelector('span');
                categoriaNome = span ? span.innerText : "";
            }

            console.log(`🖱️ [DEBUG] Clique no Card #${index+1}: Categoria="${categoriaNome}"`);
            console.log(`📝 [DEBUG] Texto atual no input: "${textoDigitado}"`);

            // SE tiver texto digitado, nós INTERROMPEMOS o link normal
            if(textoDigitado !== '') {
                console.log("🛑 [DEBUG] Texto detectado! Bloqueando link padrão e combinando busca...");
                e.preventDefault(); 
                fazerPesquisa(textoDigitado, categoriaNome);
            } else {
                console.log("🟢 [DEBUG] Input vazio. Deixando o link funcionar normalmente (mas via JS para garantir)...");
                e.preventDefault(); 
                fazerPesquisa('', categoriaNome);
            }
        });
    });
}

// 3. Função Central que redireciona
function fazerPesquisa(texto, categoria) {
    console.log(`🚀 [DEBUG] Processando redirecionamento... Texto: "${texto}", Categoria: "${categoria}"`);

    if(!texto && !categoria) {
        console.warn("⚠️ [DEBUG] Busca cancelada: Nada digitado e nenhuma categoria.");
        return;
    }

    let url = `busca.html?`;
    if(texto) url += `q=${encodeURIComponent(texto)}&`;
    if(categoria) url += `categoria=${encodeURIComponent(categoria)}`;

    console.log(`🌐 [DEBUG] Indo para URL: ${url}`);
    window.location.href = url;
}

// 4. Executa a busca na página busca.html
function setupSearchPage() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');           
    const categoria = params.get('categoria'); 
    
    console.log(`📥 [DEBUG] Página de Busca carregada. Params -> q: "${q}", categoria: "${categoria}"`);

    if(q || categoria) executarBusca(q, categoria);
}

async function executarBusca(q, categoria) {
    try {
        let url = `${API_URL}/search?`;
        if (q) url += `q=${encodeURIComponent(q)}&`;
        if (categoria) url += `categoria=${encodeURIComponent(categoria)}`;

        console.log(`📡 [DEBUG] Chamando API: ${url}`);

        const res = await fetch(url);
        
        if (!res.ok) {
            console.error(`❌ [DEBUG] Erro na API: ${res.status}`);
            return;
        }

        const data = await res.json();
        console.log(`📦 [DEBUG] API respondeu. Produtos encontrados: ${data.length}`);

        const track = document.getElementById("search-track");
        
        if(track) {
            track.innerHTML = '';
            
            if (data.length === 0) {
                track.innerHTML = '<p style="padding:20px; width:100%; text-align:center;">Nenhum produto encontrado.</p>';
                return;
            }

            data.forEach(p => {
                track.innerHTML += `
                <a href="product.html?id=${p.id}" class="product-card">
                    <div class="product-image"><img src="${p.image||p.imagem}" onerror="this.src='https://via.placeholder.com/150'"></div>
                    <h3>${p.name||p.titulo}</h3>
                    <p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p>
                </a>`;
            });
        }
    } catch(e){
        console.error("❌ [DEBUG] Erro fatal na busca:", e);
    }
}


/* ==============================================================
   🛒 LÓGICA DO CARRINHO (CART.HTML)
   ============================================================== */
async function carregarPaginaCarrinho() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    if (!cartItemsContainer) return;

    let cart = getCarrinho();
    cartItemsContainer.innerHTML = ''; 

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Seu carrinho está vazio.</td></tr>';
        if (cartTotalElement) cartTotalElement.innerText = 'R$ 0,00';
        return;
    }

    let total = 0;

    for (const item of cart) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();

            const nome = p.name || p.titulo;
            const precoBase = parseFloat(p.price || p.preco_novo);
            const imagem = p.image || p.imagem;
            const qtd = item.quantidade || item.quantity || 1; 

            const precoFinal = precoBase * FATOR_PRECO;
            const subtotal = precoFinal * qtd;
            total += subtotal;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><img src="${imagem}" width="60" style="border-radius:4px;"></td>
                <td>${nome}</td>
                <td>${Number(precoFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px; justify-content: center;">
                        <button onclick="alterarQuantidade(${item.id}, -1)">-</button>
                        <strong>${qtd}</strong>
                        <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                    </div>
                </td>
                <td>${Number(subtotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td><button onclick="removerItem(${item.id})" style="color:red; border:none; cursor:pointer;">&times;</button></td>
            `;
            cartItemsContainer.appendChild(row);
        } catch (e) {}
    }
    if (cartTotalElement) cartTotalElement.innerText = Number(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function alterarQuantidade(id, delta) {
    let c = getCarrinho();
    const i = c.find(p => p.id === id);
    if (i) {
        i.quantidade = (i.quantidade || 1) + delta;
        delete i.quantity;
        if (i.quantidade <= 0) c = c.filter(p => p.id !== id);
        localStorage.setItem('nossoCarrinho', JSON.stringify(c));
        carregarPaginaCarrinho();
        atualizarIconeCarrinho();
    }
}
function removerItem(id) {
    let c = getCarrinho().filter(p => p.id !== id);
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    carregarPaginaCarrinho();
    atualizarIconeCarrinho();
}


/* ==============================================================
   💳 CHECKOUT & FINALIZAR PEDIDO
   ============================================================== */
async function carregarPaginaCheckout() {
    const listaResumo = document.querySelector('.summary-item-list');
    const areaBotoes = document.querySelector('.order-summary-box');
    const totalEl = document.getElementById('cart-total');

    if (!listaResumo) return;

    const carrinho = getCarrinho();
    
    if (carrinho.length === 0) {
        listaResumo.innerHTML = '<p>Seu carrinho está vazio.</p>';
        const btns = document.querySelectorAll('.btn-place-order');
        btns.forEach(b => b.style.display = 'none');
        return;
    }

    listaResumo.innerHTML = '<p>Carregando itens...</p>';
    
    let html = '';
    let subtotal = 0;
    let itensParaProcessar = []; 

    for (const item of carrinho) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();
            
            const titulo = p.name || p.titulo;
            const precoBase = parseFloat(p.price || p.preco_novo);
            const precoFinal = precoBase * FATOR_PRECO;
            const totalItem = precoFinal * item.quantidade;

            subtotal += totalItem;
            
            itensParaProcessar.push({
                nome: titulo,
                qtd: item.quantidade,
                unitario: precoFinal,
                total: totalItem,
                id: p.id
            });

            html += `
            <div class="summary-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <span>(${item.quantidade}x) ${titulo}</span>
                <strong>${Number(totalItem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>
            </div>`;
        } catch (e) {}
    }

    listaResumo.innerHTML = html;
    if(totalEl) totalEl.textContent = Number(subtotal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

    // BOTÕES (Vendedor vs Cliente)
    const containerAntigo = document.getElementById('container-botoes-dinamicos');
    if(containerAntigo) containerAntigo.remove();

    const container = document.createElement('div');
    container.id = "container-botoes-dinamicos";
    container.style.marginTop = "20px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "10px";

    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));

    if (afiliadoLogado) {
        const btnZap = document.createElement('button');
        btnZap.className = "btn-place-order";
        btnZap.style.background = "#27ae60"; 
        btnZap.innerHTML = `<i class="ph ph-whatsapp-logo"></i> Finalizar no WhatsApp`;
        btnZap.onclick = () => finalizarNoZap(itensParaProcessar, subtotal);

        const btnPDF = document.createElement('button');
        btnPDF.className = "btn-place-order";
        btnPDF.style.background = "#34495e"; 
        btnPDF.innerHTML = `<i class="ph ph-file-pdf"></i> Baixar Orçamento PDF`;
        btnPDF.onclick = () => gerarOrcamentoPDF(itensParaProcessar, subtotal);

        container.appendChild(btnZap);
        container.appendChild(btnPDF);

    } else {
        const btnPagar = document.createElement('button');
        btnPagar.className = "btn-place-order";