/* ==============================================================
   🚀 SCRIPT GERAL DO SITE (Versão Final: Busca Avançada + Parceiro)
   ============================================================== */

// CONFIGURAÇÕES GLOBAIS
const API_URL = ''; // Vazio = usa o mesmo domínio
let FATOR_PRECO = 1.0; // Padrão

// --- FUNÇÕES UTILITÁRIAS ---
function formatarMoeda(valorBase) {
    if (valorBase == null || isNaN(valorBase)) return 'R$ 0,00';
    const valorFinal = valorBase * FATOR_PRECO;
    return Number(valorFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCarrinho() {
    try { return JSON.parse(localStorage.getItem('nossoCarrinho') || '[]'); } 
    catch (e) { return []; }
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
    atualizarIconeCarrinho();
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
        setupSearchPage(); // <--- Essa função foi turbinada abaixo
    }

    setupGlobalSearch();
    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    if (typeof iniciarSlider === 'function') iniciarSlider();
});


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
   💳 CHECKOUT INTELIGENTE
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
        btnPagar.innerHTML = `✅ Finalizar Pedido`;
        btnPagar.dataset.itens = JSON.stringify(itensParaProcessar);
        btnPagar.onclick = finalizarPedido; 
        container.appendChild(btnPagar);
    }
    
    if(areaBotoes) areaBotoes.appendChild(container);
    const btnOriginal = document.querySelector('.btn-place-order:not(#container-botoes-dinamicos button)');
    if(btnOriginal) btnOriginal.style.display = 'none';
}

// --- FUNÇÃO DE PAGAMENTO ---
async function finalizarPedido() {
    const btn = document.querySelector('#container-botoes-dinamicos button');
    const email = document.getElementById('email').value; // Usado como Nome
    const rua = document.getElementById('rua').value;
    
    if(!email || !rua) return alert("Preencha Nome e Endereço.");

    const afiliadoCodigo = localStorage.getItem('afiliadoCodigo'); // Pega do link (ref)

    btn.innerText = "Processando...";
    btn.disabled = true;

    try {
        const body = {
            cliente: { nome: email, email: email, endereco: rua }, // Email usado como ID
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
        window.location.href = 'index.html';

    } catch (e) {
        alert("Erro: " + e.message);
        btn.innerText = "Tentar Novamente";
        btn.disabled = false;
    }
}

// --- PDF & ZAP (Mesmos de antes) ---
function gerarOrcamentoPDF(itens, totalGeral) {
    if (!window.jspdf) return alert("Erro: jsPDF não carregado.");
    const doc = new window.jspdf.jsPDF();
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    
    doc.setFontSize(22); doc.setTextColor(230, 126, 34); doc.text("AutoPeças Veloz", 20, 20);
    doc.setFontSize(12); doc.setTextColor(0); doc.text("Orçamento Oficial", 20, 30);
    doc.text(`Vendedor: ${afiliado.nome}`, 20, 36); doc.text(`Data: ${new Date().toLocaleDateString()}`, 20, 42);
    doc.line(20, 45, 190, 45);

    let y = 55;
    doc.setFontSize(10); doc.text("QTD   PRODUTO", 20, y); doc.text("TOTAL", 170, y, { align: "right" }); y += 5;

    itens.forEach(item => {
        const linha = `${item.qtd}x    ${item.nome.substring(0, 40)}`;
        doc.text(linha, 20, y);
        doc.text(item.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), 170, y, { align: "right" });
        y += 7;
    });

    doc.line(20, y, 190, y); y += 10;
    doc.setFontSize(14); doc.setFont(undefined, 'bold');
    doc.text(`TOTAL: ${totalGeral.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`, 170, y, { align: "right" });

    // Link Mágico
    const dadosCarrinho = encodeURIComponent(JSON.stringify(itens.map(i => ({id: i.id, quantidade: i.qtd}))));
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '').replace('cart.html', '') + 'checkout.html';
    let linkPagamento = `${baseUrl}?restore=${dadosCarrinho}&ref=${afiliado.codigo}`;

    y += 20; doc.setTextColor(0, 0, 255); doc.setFontSize(11);
    doc.textWithLink("CLIQUE AQUI PARA PAGAR AGORA", 105, y, { url: linkPagamento, align: "center" });
    doc.save(`Orcamento.pdf`);
}

function finalizarNoZap(itens, total) {
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    let msg = `*🏎️ Orçamento - AutoPeças Veloz*\n*Vendedor:* ${afiliado.nome}\n------------------\n`;
    itens.forEach(i => msg += `✅ ${i.qtd}x ${i.nome}\n   R$ ${i.total.toFixed(2)}\n`);
    msg += `------------------\n*TOTAL: R$ ${total.toFixed(2)}*\n`;
    
    const dadosCarrinho = encodeURIComponent(JSON.stringify(itens.map(i => ({id: i.id, quantidade: i.qtd}))));
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html';
    const link = `${baseUrl}?restore=${dadosCarrinho}&ref=${afiliado.codigo}`;
    msg += `\n🔗 *Pagar:* \n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}


/* ==============================================================
   🔎 PRODUTOS & BUSCA (CORRIGIDO PARA ACEITAR CATEGORIAS)
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
        document.getElementById('product-title').textContent = p.name || p.titulo;
        document.getElementById('main-product-image').src = p.image || p.imagem || '';
        document.getElementById('product-price-new').textContent = formatarMoeda(parseFloat(p.price || p.preco_novo));
        if((p.quantity || p.estoque) > 0) document.querySelector('.btn-add-cart').disabled = false;
    } catch(e) {}
}

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
        console.warn("⚠️ [DEBUG] ALERTA: Nenhum card de categoria encontrado. Verifique se a classe 'category-card' está no HTML.");
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
                categoriaNome = span ? span.innerText : "Desconhecida";
            }

            console.log(`🖱️ [DEBUG] Clique no Card #${index+1}: Categoria="${categoriaNome}"`);
            console.log(`📝 [DEBUG] Texto atual no input: "${textoDigitado}"`);

            // SE tiver texto digitado, nós INTERROMPEMOS o link normal
            if(textoDigitado !== '') {
                console.log("🛑 [DEBUG] Texto detectado! Bloqueando link padrão e combinando busca...");
                e.preventDefault(); // <--- AQUI É O PULO DO GATO
                
                fazerPesquisa(textoDigitado, categoriaNome);
            } else {
                console.log("🟢 [DEBUG] Input vazio. Deixando o link funcionar normalmente...");
                // Não fazemos e.preventDefault(), o navegador segue o href do link
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
            console.error(`❌ [DEBUG] Erro na API: ${res.status} - ${res.statusText}`);
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

// --- AQUI ESTÁ A CORREÇÃO DA BUSCA ---
function setupSearchPage() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');           // Texto (Gol, Oleo, etc)
    const categoria = params.get('categoria'); // Categoria (Motor, Freio)
    
    // Se tiver qualquer um dos dois, executa a busca
    if(q || categoria) executarBusca(q, categoria);
}

async function executarBusca(q, categoria) {
    try {
        // Monta a URL correta para o servidor
        let url = `${API_URL}/search?`;
        if (q) url += `q=${encodeURIComponent(q)}&`;
        if (categoria) url += `categoria=${encodeURIComponent(categoria)}`;

        const res = await fetch(url);
        const data = await res.json();
        const track = document.getElementById("search-track");
        
        if(track) {
            track.innerHTML = '';
            
            if (data.length === 0) {
                track.innerHTML = '<p style="padding:20px;">Nenhum produto encontrado.</p>';
                return;
            }

            data.forEach(p => {
                track.innerHTML += `
                <a href="product.html?id=${p.id}" class="product-card">
                    <div class="product-image"><img src="${p.image||p.imagem}"></div>
                    <h3>${p.name||p.titulo}</h3>
                    <p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p>
                </a>`;
            });
        }
    } catch(e){
        console.error("Erro busca:", e);
    }
}

/* =======================================================
   🦊 FUNÇÕES VISUAIS DO PARCEIRO
   ======================================================= */
function ativarModoParceiro(afiliado) {
    const btnLogin = document.getElementById('btn-login-header');
    if (btnLogin) {
        btnLogin.innerHTML = `<i class="ph ph-sign-out"></i><span>Sair (${afiliado.nome})</span>`;
        btnLogin.href = "#";
        btnLogin.style.color = "#e67e22"; 
        btnLogin.onclick = (e) => {
            e.preventDefault();
            if(confirm(`Sair do modo parceiro?`)) {
                localStorage.removeItem('afiliadoLogado');
                localStorage.removeItem('minhaMargem'); 
                window.location.reload();
            }
        };
    }

    // BARRA PRETA NO TOPO
    const margemAtual = localStorage.getItem('minhaMargem') || 0;
    const barraAntiga = document.getElementById('barra-parceiro');
    if (barraAntiga) barraAntiga.remove();

    const barra = document.createElement('div');
    barra.id = "barra-parceiro";
    barra.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 50px;
        background: #2c3e50; color: white; 
        z-index: 999999; display: flex; justify-content: center; align-items: center; gap: 15px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-family: sans-serif;
    `;
    
    barra.innerHTML = `
        <span style="font-weight:bold; color:#f39c12;">🦊 ${afiliado.nome}</span>
        <div style="height: 20px; width: 1px; background: #555;"></div>
        <a href="afiliado_dashboard.html" style="text-decoration: none; color: white; background: rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 4px; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.2);">
            <i class="ph ph-gauge"></i> Meu Painel
        </a>
        <div style="height: 20px; width: 1px; background: #555;"></div>
        <div style="display:flex; align-items:center; gap:5px; background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px;">
            <label style="font-size: 0.85rem; color:#ddd;">Comissão:</label>
            <input type="number" id="input-margem" value="${margemAtual}" min="0" max="100" style="width:50px; padding:4px; border-radius:4px; border:none; text-align:center;"> %
        </div>
        <button id="btn-aplicar-margem" style="background:#27ae60; color:white; border:none; padding:6px 15px; border-radius:4px; cursor:pointer; font-weight:bold;">APLICAR</button>
    `;

    document.body.prepend(barra); 
    document.body.style.paddingTop = "50px"; 

    document.getElementById('btn-aplicar-margem').addEventListener('click', async () => {
        const novaMargem = parseFloat(document.getElementById('input-margem').value);
        localStorage.setItem('minhaMargem', novaMargem);
        try {
            if(afiliado.token) await fetch('/afiliado/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${afiliado.token}` }, body: JSON.stringify({ novaMargem }) });
        } catch(e) {}
        alert(`Comissão atualizada!`); window.location.reload(); 
    });
}

// Checagem de Margem para Cliente (Ref)
async function carregarMargemDoCodigo(codigo) {
    try {
        const res = await fetch(`${API_URL}/afiliado/check/${codigo}`);
        if (res.ok) {
            const data = await res.json();
            if (data.margem) {
                FATOR_PRECO = 1 + (data.margem / 100);
            }
        }
    } catch (e) {}
}