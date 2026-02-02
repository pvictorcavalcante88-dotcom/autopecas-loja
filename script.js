/* ==============================================================
   🚀 SCRIPT GERAL (SALVAMENTO AUTOMÁTICO NO CHECKOUT)
   ============================================================== */

const API_URL = window.location.origin;
let FATOR_GLOBAL = 1.0; 

// LISTA DE CARROS ACEITOS (WHITELIST)
// Adicione mais carros aqui conforme necessário.
// A ordem importa pouco, mas nomes compostos (ex: Grand Siena) funcionam melhor.
const LISTA_CARROS = [
    "GOL", "PALIO", "UNO", "CELTA", "CORSA", "VOYAGE", "SAVEIRO", "STRADA", "PARATI",
    "SIENA", "GRAND SIENA", "FOX", "SPACEFOX", "KA", "FIESTA", "ECOSPORT", "FOCUS",
    "ONIX", "PRISMA", "COBALT", "SPIN", "TRACKER", "S10", "MONTANA", "MERIVA", "ZAFIRA",
    "HB20", "HB20S", "CRETA", "TUCSON", "I30", "IX35", "HR",
    "SANDERO", "LOGAN", "DUSTER", "KWID", "CLIO", "CAPTUR", "OROCH", "MASTER",
    "CIVIC", "CITY", "FIT", "HRV", "WRV", "CRV",
    "COROLLA", "ETIOS", "YARIS", "HILUX", "SW4", "RAV4",
    "RENEGADE", "COMPASS", "TORO", "COMMANDER",
    "POLO", "VIRTUS", "JETTA", "GOLF", "AMAROK", "T-CROSS", "NIVUS", "UP",
    "MOBI", "ARGO", "CRONOS", "PULSE", "FASTBACK", "FIORINO", "DUCATO",
    "RANGER", "L200", "TRITON", "PAJERO", "ASX", "LANCER",
    "KICKS", "VERSA", "SENTRA", "FRONTIER", "MARCH",
    "206", "207", "208", "2008", "3008", "C3", "C4", "CACTUS", "AIRCROSS", "TCROSS", "KARDIAN",
    "GRAND SIENA"

];


// --- FUNÇÕES UTILITÁRIAS ---
function formatarMoeda(valor) {
    if (valor == null || isNaN(valor)) return 'R$ 0,00';
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCarrinho() {
    try { return JSON.parse(localStorage.getItem('nossoCarrinho') || '[]'); } 
    catch (e) { return []; }
}

function atualizarIconeCarrinho() {
    const carrinho = getCarrinho();
    const totalItens = carrinho.reduce((acc, item) => acc + (item.quantidade || 1), 0);
    const icon = document.querySelector('.cart-button span:last-child');
    if(icon) {
        icon.textContent = totalItens;
        icon.style.display = totalItens > 0 ? 'grid' : 'none';
    }
}

function adicionarAoCarrinho(id, qtd) {
    let c = getCarrinho();
    let item = c.find(p => p.id == id);
    const margemInicial = parseFloat(localStorage.getItem('minhaMargem') || 0);

    // CAPTURA O TÍTULO E PREÇO
    const nomeProduto = document.getElementById('prod-title')?.innerText.trim() || "Produto sem nome";
    const precoTexto = document.getElementById('prod-price')?.innerText || "0";
    const precoLimpo = limparPrecoBR(precoTexto);

    // 🟢 NOVA CAPTURA: Captura o ID do Tiny (deve estar em um campo oculto ou global)
    // Se você salvou o produto na página como um objeto global, use ele:
    const tinyIdCapturado = window.currentProductTinyId || null; 

    if (item) {
        item.quantidade = (item.quantidade || 1) + qtd;
        item.preco = precoLimpo; 
        item.nome = nomeProduto;
        // Atualiza o tinyId caso não tenha
        if (!item.tinyId) item.tinyId = tinyIdCapturado;
    } else {
        c.push({ 
            id: parseInt(id), 
            tinyId: tinyIdCapturado, // ✅ AGORA SALVAMOS O ID DO TINY NO CARRINHO
            quantidade: qtd, 
            preco: precoLimpo, 
            nome: nomeProduto,
            customMargin: margemInicial 
        });
    }
    
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
    alert(`✅ ${nomeProduto} adicionado ao carrinho!`);
}

function limparPrecoBR(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;
    
    let limpo = valor.toString()
                     .replace(/R\$/g, '')    // Remove o R$
                     .replace(/\u00a0/g, '') // REMOVE O &nbsp; (O GRANDE VILÃO)
                     .replace(/\s/g, '')     // Remove espaços comuns
                     .replace(/\./g, '')     // Remove ponto de milhar
                     .replace(',', '.')      // Troca vírgula por ponto
                     .trim();
    
    return parseFloat(limpo) || 0;
}


// ==============================================================
// 🏁 INICIALIZAÇÃO
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (afiliadoLogado) {
        const margemSalva = parseFloat(localStorage.getItem('minhaMargem') || 0);
        FATOR_GLOBAL = 1 + (margemSalva / 100);
        ativarModoParceiro(afiliadoLogado);
    } 
    else {
        const paramsURL = new URLSearchParams(window.location.search);
        const refCode = paramsURL.get('ref') || localStorage.getItem('afiliadoCodigo');
        if (refCode) {
            localStorage.setItem('afiliadoCodigo', refCode);
            await carregarMargemDoCodigo(refCode);
        }
    }

    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 

    // No topo do script.js
    if (restoreData) {
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            
            if (Array.isArray(itensResgatados)) {
                const carrinhoParaSalvar = itensResgatados.map(item => ({
                    id: item.id,
                    tinyId: item.ti || item.tinyId, // ✅ Recupera o Tiny ID do link
                    quantidade: item.q || item.quantidade,
                    nome: item.n || item.nome,
                    // ✅ Voltamos para o preço de Custo (150.00)
                    preco: item.pc || item.preco, 
                    // ✅ Devolvemos a margem original (25)
                    customMargin: item.m || 0 
                }));

                localStorage.setItem('nossoCarrinho', JSON.stringify(carrinhoParaSalvar));
            }
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.reload(); 
        } catch (e) { console.error("Erro na restauração:", e); }
    }

    atualizarIconeCarrinho();
    const path = window.location.pathname;

    if (path.includes('checkout.html')) await carregarPaginaCheckout();
    else if (path.includes('cart.html')) carregarPaginaCarrinho();
    else if (path.includes('product.html')) setupProductPage();
    else if (path.includes('busca.html')) setupSearchPage();

    setupGlobalSearch();
    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    if (typeof iniciarSlider === 'function') iniciarSlider();

    // 1. Pega os parâmetros da URL (ex: ?q=pastilha)
    const params = new URLSearchParams(window.location.search);
    const termoPesquisado = params.get('q'); // Ou 'search', dependendo de como você nomeou no input
    const categoria = params.get('categoria');

    // 2. Pega o elemento do título
    const tituloEl = document.getElementById('titulo-busca');

    // 3. Atualiza o texto conforme o que tiver na URL
    if (tituloEl) {
        if (termoPesquisado) {
            tituloEl.innerText = `Resultados para: "${termoPesquisado}"`;
            tituloEl.style.display = 'block';
        } else if (categoria) {
            tituloEl.innerText = `Categoria: "${categoria}"`;
            tituloEl.style.display = 'block';
        } else {
            // Se não tiver pesquisa, esconde o título ou muda para "Destaques"
            tituloEl.innerText = "Destaques da Loja";
            // ou tituloEl.style.display = 'none';
        }
    }

});


// ==============================================================
// 🛒 CARRINHO FINAL (TÍTULO CORRIGIDO)
// ==============================================================
async function carregarPaginaCarrinho() {
    if (!localStorage.getItem('afiliadoLogado')) {
        alert("Você precisa fazer login para acessar o carrinho.");
        window.location.href = "afiliado_login.html";
        return;
    }

    const numParcelas = parseInt(document.getElementById('simular-parcelas')?.value || 1);
    const cartItemsContainer = document.getElementById('cart-items-desktop');
    const cartMobileContainer = document.getElementById('cart-items-mobile');
    
    const cartTotalElement = document.getElementById('cart-total');
    const cartSubtotalElement = document.getElementById('cart-subtotal');
    const rowLucro = document.getElementById('row-afiliado-lucro');
    const valorLucro = document.getElementById('afiliado-lucro-valor');
    const divAcoes = document.getElementById('afiliado-cart-actions');
    const elGanhoBruto = document.getElementById('cart-ganho-bruto');
    const elTaxasEstimadas = document.getElementById('cart-taxas-estimadas');

    let cart = getCarrinho();
    
    if (cartItemsContainer) cartItemsContainer.innerHTML = ''; 
    if (cartMobileContainer) cartMobileContainer.innerHTML = '';
    if (divAcoes) divAcoes.innerHTML = '';
    
    let totalVenda = 0;
    let totalLucroLiquido = 0; 
    let totalGanhoBruto = 0;   
    let totalTaxas = 0;        

    const isAfiliado = !!localStorage.getItem('afiliadoLogado');

    if (cart.length === 0) {
        if(cartItemsContainer) cartItemsContainer.innerHTML = '<tr><td colspan="6" align="center" style="padding:20px;">Seu carrinho está vazio.</td></tr>';
        if(cartMobileContainer) cartMobileContainer.innerHTML = '<div style="text-align:center; padding:20px;">Carrinho vazio.</div>';
        if (cartTotalElement) cartTotalElement.innerText = 'R$ 0,00';
        if (cartSubtotalElement) cartSubtotalElement.innerText = 'R$ 0,00';
        if (rowLucro) rowLucro.style.display = 'none';
        return;
    }

    for (const item of cart) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();

            // ====================================================
            // 🟢 LÓGICA BLINDADA DO CARRO
            // ====================================================
            let carroDisplay = "";
            let listaOficialArray = [];

            if (p.carros) {
                // 1. Limpa a lista do banco
                listaOficialArray = p.carros.toUpperCase().split(',').map(c => c.trim());
                const termoPesquisaItem = (item.termoPesquisa || '').toUpperCase().trim();
                
                // 2. Busca exata (Regex \b evita UP dentro de interruptor)
                const carroMatch = LISTA_CARROS.find(c => {
                    const regex = new RegExp(`\\b${c}\\b`, 'i');
                    return regex.test(termoPesquisaItem) && listaOficialArray.includes(c);
                });

                if (carroMatch) {
                    carroDisplay = carroMatch;
                } else {
                    // 3. Fallback: Se não achou, pega o PRIMEIRO da lista
                    if (listaOficialArray.length > 0) {
                        carroDisplay = listaOficialArray[0];
                    } else {
                        carroDisplay = "UNIVERSAL";
                    }
                }
            } else {
                carroDisplay = "UNIVERSAL";
            }
            // ====================================================

            // 🔴 CORREÇÃO DO TÍTULO: 
            // Em vez de usar montarNomeCompleto(item, p), montamos aqui usando o carroDisplay correto
            // Isso força o título a ser "Interruptor... : ACCORD" em vez de "... : UP"
            const tituloBase = p.name || p.titulo;
            const nomeExibir = (carroDisplay !== "UNIVERSAL") 
                ? `${tituloBase} : ${carroDisplay}` 
                : tituloBase;

            const precoBase = parseFloat(p.price || p.preco_novo);
            let margemAplicada = (item.customMargin !== undefined) ? item.customMargin : ((FATOR_GLOBAL - 1) * 100);
            
            const math = calcularSimulacaoLiquida(precoBase, margemAplicada, numParcelas);

            const subtotalItem = math.precoFinal * item.quantidade;
            const lucroLiquidoItemTotal = math.lucroLiquido * item.quantidade;
            
            totalVenda += subtotalItem;
            totalLucroLiquido += lucroLiquidoItemTotal;
            totalGanhoBruto += math.lucroBruto * item.quantidade;
            totalTaxas += math.taxasEstimadas * item.quantidade;

            // DESKTOP HTML
            if (cartItemsContainer) {
                const htmlMargemPC = isAfiliado ? `
                    <div style="margin-top:5px; font-size:0.85rem; color:#e67e22; display:flex; flex-direction:column; gap:2px;">
                        <div>
                            Margem: <input type="number" value="${margemAplicada}" 
                            style="width:50px; text-align:center; border:1px solid #ddd; border-radius:3px;" 
                            onchange="atualizarMargemCarrinho(${item.id}, this.value)"> %
                        </div>
                        <div style="font-size:0.75rem; color:#27ae60; font-weight:bold;">
                            Líq: ${formatarMoeda(math.lucroLiquido)} <span style="color:#aaa; font-weight:normal;">/un</span>
                        </div>
                    </div>` : '';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><img src="${p.image||p.imagem}" width="60" style="vertical-align:middle; border-radius:4px;" onerror="this.src='https://placehold.co/100'"></td>
                    <td>
                        <strong>${nomeExibir}</strong> 
                        ${htmlMargemPC}
                    </td>
                    <td>${formatarMoeda(math.precoFinal)}</td>
                    <td>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <button onclick="alterarQuantidade(${item.id}, -1)" style="padding:2px 8px;">-</button> 
                            <span>${item.quantidade}</span> 
                            <button onclick="alterarQuantidade(${item.id}, 1)" style="padding:2px 8px;">+</button>
                        </div>
                    </td>
                    <td style="font-weight:bold;">${formatarMoeda(subtotalItem)}</td>
                    <td><button onclick="removerItem(${item.id})" style="color:#c0392b; border:none; background:none; cursor:pointer; font-size:1.2rem;">&times;</button></td>
                `;
                cartItemsContainer.appendChild(row);
            }

            // MOBILE HTML
            if (cartMobileContainer) {
                const htmlMargemMobile = isAfiliado ? `
                    <div class="mobile-lucro-box" style="background:#f9f9f9; padding:8px; border-radius:5px; margin:10px 0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <strong>Margem:</strong>
                            <div>
                                <input type="number" value="${margemAplicada}" 
                                    style="width:50px; padding:5px; border:1px solid #ddd; text-align:center;"
                                    onchange="atualizarMargemCarrinho(${item.id}, this.value)"> %
                            </div>
                        </div>
                        <div style="text-align:right; font-size:0.9rem; color:#27ae60;">
                            Líq: <strong>${formatarMoeda(math.lucroLiquido)}</strong> /un
                        </div>
                    </div>` : '';

                const card = document.createElement('div');
                card.className = 'mobile-cart-card';
                card.innerHTML = `
                    <div style="display:flex; gap:10px; align-items:center;">
                        <img src="${p.image||p.imagem}" class="mobile-cart-img" style="width:60px; height:60px; object-fit:contain;" onerror="this.src='https://placehold.co/100?text=S/Img'">
                        <div style="flex:1;">
                            <div class="mobile-cart-title" style="font-weight:bold; font-size:0.95rem;">${nomeExibir}</div>
                            <div style="color:#777; font-size:0.85rem;">${formatarMoeda(math.precoFinal)} unit.</div>
                        </div>
                    </div>
                    ${htmlMargemMobile}
                    <div class="mobile-cart-details" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <div class="mobile-qty-box">
                            <button onclick="alterarQuantidade(${item.id}, -1)">-</button>
                            <strong style="margin:0 10px;">${item.quantidade}</strong>
                            <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                        </div>
                        <div style="font-size:1.1rem; color:#2c3e50; font-weight:800;">
                            ${formatarMoeda(subtotalItem)}
                        </div>
                    </div>
                    <button class="mobile-remove-btn" onclick="removerItem(${item.id})" style="width:100%; margin-top:10px; background:none; border:1px solid #fab1a0; color:#e17055; padding:8px; border-radius:4px;">
                        Remover
                    </button>
                    <hr style="margin-top:15px; border:0; border-top:1px solid #eee;">
                `;
                cartMobileContainer.appendChild(card);
            }

        } catch (e) { console.error(e); }
    }
    
    // BOTÕES DE AÇÃO FINAIS
    if (cartItemsContainer && cart.length > 0) {
        const rowLimpar = document.createElement('tr');
        rowLimpar.innerHTML = `<td colspan="6" style="text-align: right; padding-top: 15px;"><button onclick="limparCarrinho()" style="background:none; border:1px solid #e74c3c; color:#e74c3c; padding:8px 15px; border-radius:4px; cursor:pointer; font-size:0.9rem; display:inline-flex; align-items:center; gap:5px;"><i class="ph ph-trash"></i> Esvaziar Carrinho</button></td>`;
        cartItemsContainer.appendChild(rowLimpar);
    }
    if (cartMobileContainer && cart.length > 0) {
         const btnLimparMobile = document.createElement('div');
         btnLimparMobile.innerHTML = `<button onclick="limparCarrinho()" style="width:100%; margin:20px 0; background:none; border:1px solid #e74c3c; color:#e74c3c; padding:10px; border-radius:4px;">Esvaziar Carrinho</button>`;
         cartMobileContainer.appendChild(btnLimparMobile);
    }

    if (cartTotalElement) cartTotalElement.innerText = formatarMoeda(totalVenda);
    if (cartSubtotalElement) cartSubtotalElement.innerText = formatarMoeda(totalVenda);

    if (isAfiliado && rowLucro) {
        rowLucro.style.display = 'flex';
        if (elGanhoBruto) elGanhoBruto.innerText = formatarMoeda(totalGanhoBruto);
        if (elTaxasEstimadas) elTaxasEstimadas.innerText = formatarMoeda(totalTaxas);
        if (valorLucro) valorLucro.innerText = formatarMoeda(totalLucroLiquido);
    }

    if (divAcoes && isAfiliado && cart.length > 0) {
        divAcoes.innerHTML = `<button onclick="window.location.href='checkout.html'" class="btn-place-order" style="width:100%; margin-top:15px; background:#34495e; color:white; padding:15px; font-size:1.1rem;"><i class="ph ph-whatsapp-logo"></i> Finalizar / Gerar Link</button>`;
    }

    const infoParcela = document.getElementById('info-parcela');
    if (infoParcela && numParcelas > 1) {
        const valorParcela = totalVenda / numParcelas;
        infoParcela.innerText = `${numParcelas}x de ${formatarMoeda(valorParcela)}`;
    } else if (infoParcela) {
        infoParcela.innerText = "";
    }
}
// --- FUNÇÃO NOVA: LIMPAR TUDO ---
function limparCarrinho() {
    if(confirm("Tem certeza que deseja esvaziar todo o carrinho?")) {
        localStorage.removeItem('nossoCarrinho');
        carregarPaginaCarrinho();
        atualizarIconeCarrinho();
        // Se tiver botões de checkout do afiliado, remove também para forçar refresh
        const acoes = document.getElementById('afiliado-cart-actions');
        if(acoes) acoes.remove();
    }
}

function atualizarMargemCarrinho(id, novaMargem) {
    let c = getCarrinho();
    let item = c.find(p => p.id == id);
    if(item) {
        item.customMargin = parseFloat(novaMargem);
        localStorage.setItem('nossoCarrinho', JSON.stringify(c));
        carregarPaginaCarrinho(); 
    }
}

// Botão Simples no Carrinho (apenas leva ao checkout, onde a mágica acontece)
function renderizarBotoesAfiliadoCarrinho() {
    const areaTotal = document.querySelector('.cart-total-box'); 
    if(!areaTotal) return;

    const oldBtns = document.getElementById('afiliado-cart-actions');
    if(oldBtns) oldBtns.remove();

    const div = document.createElement('div');
    div.id = 'afiliado-cart-actions';
    div.style.marginTop = '15px';
    
    div.innerHTML = `
        <button onclick="irParaCheckoutAfiliado()" style="background:#34495e; color:white; padding:12px; border:none; border-radius:5px; cursor:pointer; width:100%; font-weight:bold;">
            <i class="ph ph-share-network"></i> Finalizar / Gerar Link
        </button>
    `;
    areaTotal.appendChild(div);
}

function irParaCheckoutAfiliado() { window.location.href = 'checkout.html'; }


/* ==============================================================
   CHECKOUT (MÁGICA DO SALVAMENTO AUTOMÁTICO)
   ============================================================== */
async function carregarPaginaCheckout() {
    // 1. Verifica itens no carrinho
    const carrinho = getCarrinho();
    const afiliadoLogado = localStorage.getItem('afiliadoLogado');

    // --- BLOQUEIO DE SEGURANÇA INTELIGENTE ---
    if (!afiliadoLogado && carrinho.length === 0) {
        window.location.href = "afiliado_login.html"; // Ou index.html
        return;
    }
    // ------------------------------------------

    const listaResumo = document.querySelector('.summary-item-list');
    const areaBotoes = document.querySelector('.order-summary-box');
    const totalEl = document.getElementById('cart-total');
    
    if (!listaResumo) return;

    if (carrinho.length === 0) { 
        listaResumo.innerHTML = '<p>Carrinho vazio.</p>'; 
        return; 
    }

    let subtotal = 0;
    let itensParaProcessar = []; 
    let html = '';

    for (const item of carrinho) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            
            const p = await response.json();
            const precoBase = parseFloat(item.preco || p.price || p.preco_novo);
            
            // Se tem margem customizada no item, usa. Se não, usa a global.
            let margem = (item.customMargin !== undefined) ? item.customMargin : ((FATOR_GLOBAL - 1) * 100);
            
            const precoFinal = precoBase * (1 + (margem / 100));
            const totalItem = precoFinal * item.quantidade;
            subtotal += totalItem;
            
            // 🔥 AQUI ESTÁ A MUDANÇA PRINCIPAL 🔥
            // Usamos a função auxiliar para criar o nome completo com o carro
            const nomeExibir = montarNomeCompleto(item, p); 
            // -----------------------------------------------------------

            itensParaProcessar.push({
                nome: nomeExibir, // <--- Salvamos o nome completo aqui para o PDF/Zap
                qtd: item.quantidade, 
                unitario: precoFinal, 
                total: totalItem, 
                id: p.id, 
                customMargin: margem 
            });

            html += `<div class="summary-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <span>(${item.quantidade}x) ${nomeExibir}</span> <strong>${formatarMoeda(totalItem)}</strong>
            </div>`;
        } catch (e) { console.error(e); }
    }

    listaResumo.innerHTML = html;
    if(totalEl) totalEl.textContent = formatarMoeda(subtotal);

    // Remove botões antigos para não duplicar
    const containerAntigo = document.getElementById('container-botoes-dinamicos');
    if(containerAntigo) containerAntigo.remove();

    // Cria container novo
    const container = document.createElement('div');
    container.id = "container-botoes-dinamicos";
    container.style.marginTop = "20px";
    container.style.display = "flex"; 
    container.style.flexDirection = "column"; 
    container.style.gap = "10px";

    if (afiliadoLogado) {
        // --- VISÃO DO AFILIADO (Gerar Links) ---
        const dadosAfiliado = JSON.parse(afiliadoLogado);
        container.innerHTML = `
            <button id="btn-zap" onclick="gerarLinkZap('${dadosAfiliado.codigo}', ${subtotal})" class="btn-place-order" style="background:#27ae60;">
                <i class="ph ph-whatsapp-logo"></i> Mandar no WhatsApp
            </button>
            <button id="btn-pdf" onclick="gerarPDFCustom()" class="btn-place-order" style="background:#34495e;">
                <i class="ph ph-file-pdf"></i> Baixar PDF
            </button>
        `;
        window.ITENS_CHECKOUT = itensParaProcessar;
    } else {
        // --- VISÃO DO CLIENTE (Pagar) ---
        const btnPagar = document.createElement('button');
        btnPagar.id = "btn-finalizar-pix"; // Damos um ID para manipular o texto depois
        btnPagar.className = "btn-place-order"; 
        btnPagar.style.background = "#27ae60"; // Verde Asaas
        btnPagar.innerHTML = `<i class="ph ph-qr-code"></i> Gerar PIX e Pagar`;
        
        // AQUI ESTÁ O PULO DO GATO: Chama a função nova
        btnPagar.onclick = () => finalizarCompraAsaas(); 
        
        container.appendChild(btnPagar);
    }
    
    if(areaBotoes) areaBotoes.appendChild(container);
    
    // Esconde o botão original do template (HTML estático) se existir
    const btnOriginal = document.querySelector('.btn-place-order:not(#container-botoes-dinamicos button)');
    if(btnOriginal) btnOriginal.style.display = 'none';
}

// --- FUNÇÃO "SILENCIOSA" PARA SALVAR ORÇAMENTO --- 
async function salvarOrcamentoSilencioso(origem = 'MANUAL') {
    console.log("1. Função salvar iniciada..."); // DEBUG

    const carrinho = localStorage.getItem('nossoCarrinho');
    if (!carrinho) {
        console.log("ERRO: Carrinho vazio ou não encontrado.");
        return;
    }

    // Tenta pegar o documento
    let docCliente = null;
    const inputDoc = document.getElementById('doc-busca');
    if (inputDoc) {
        docCliente = inputDoc.value;
        console.log("2. Documento encontrado no input:", docCliente); // DEBUG
    } else {
        console.log("AVISO: Input 'doc-busca' não achado na tela. Salvando sem documento.");
    }

    // Calcula total
    const itens = JSON.parse(carrinho);
    const total = itens.reduce((acc, item) => {
        let precoBase = parseFloat(item.preco || item.preco_novo);
        let margem = item.customMargin || 0;
        // Aplica a margem para salvar o valor correto
        let precoFinal = precoBase * (1 + (margem / 100));
        return acc + (precoFinal * item.quantidade);
    }, 0);
    
    // Pega nome
    const inputNome = document.getElementById('nome_cliente'); 
    const nomeCliente = inputNome && inputNome.value ? inputNome.value : "Cliente";
    const nomeOrcamento = `Orç. ${nomeCliente} (${origem})`;

    const dadosParaEnviar = {
        nome: nomeOrcamento,
        itens: carrinho,
        total: total,
        clienteDoc: docCliente // Verifica se isso está indo
    };

    console.log("3. Enviando estes dados para o servidor:", dadosParaEnviar); // DEBUG

    try {
        const token = localStorage.getItem('afiliadoToken');
        if(!token) {
            alert("Erro: Você não está logado como afiliado.");
            return;
        }

        const res = await fetch(`${API_URL}/afiliado/orcamentos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dadosParaEnviar)
        });

        console.log("4. Resposta do servidor (Status):", res.status); // DEBUG

        if (res.ok) {
            console.log("SUCESSO: Salvo no banco!");
            if (origem === 'MANUAL') alert("✅ Orçamento salvo com sucesso!");
        } else {
            const erro = await res.json();
            console.error("ERRO DO SERVIDOR:", erro);
            alert("Erro ao salvar: " + JSON.stringify(erro));
        }
        
    } catch (e) {
        console.error("ERRO DE CONEXÃO/CÓDIGO:", e);
        alert("Erro técnico. Veja o console (F12).");
    }
}

// --- AÇÕES DO AFILIADO (COM SAVE AUTOMÁTICO) ---
async function gerarLinkZap(codigo, total) {
    // 1. Salva Primeiro
    await salvarOrcamentoSilencioso('WhatsApp');

    // 2. Gera depois
    const payload = gerarPayloadUrl();
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html';
    const link = `${baseUrl}?restore=${payload}&ref=${codigo}`;
    
    let msg = `*Orçamento Vunn*\n`; 
    window.ITENS_CHECKOUT.forEach(i => { msg += `${i.qtd}x ${i.nome} - ${formatarMoeda(i.total)}\n`; });
    msg += `*Total: ${formatarMoeda(total)}*\n\n`;
    msg += `Pague aqui: ${link}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

async function gerarPDFCustom() {
    // 1. Salva o Orçamento (Manteve sua lógica original)
    if(typeof salvarOrcamentoSilencioso === 'function') {
        await salvarOrcamentoSilencioso('PDF');
    }

    // 2. Verifica bibliotecas
    if (!window.jspdf || !window.jspdf.jsPDF) return alert("Erro: Biblioteca PDF não carregada.");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Pega dados do Afiliado (se houver) e do Carrinho
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado')) || { nome: "Vendedor", telefone: "", codigo: "" };
    const itens = window.ITENS_CHECKOUT || []; 

    // --- 🟢 CAPTURA OS DADOS DO CLIENTE DO FORMULÁRIO HTML ---
    // Note que estou usando os IDs que definimos no checkout.html
    const cliNome = document.getElementById('nome_cliente').value || "Cliente Não Identificado"; // O ID do nome é 'email' no seu HTML
    const cliEndereco = document.getElementById('rua').value || "";
    const cliTelefone = document.getElementById('input-telefone') ? document.getElementById('input-telefone').value : "";
    const cliEmail = document.getElementById('input-email-contato') ? document.getElementById('input-email-contato').value : "";

    // --- CONFIGURAÇÕES DE DESIGN ---
    const corPrimaria = [44, 62, 80];   // Azul Escuro (#2c3e50)
    const corSecundaria = [230, 126, 34]; // Laranja (#e67e22)
    const marginX = 15;
    let y = 0; 

    // --- CABEÇALHO (FUNDO AZUL) ---
    doc.setFillColor(...corPrimaria);
    doc.rect(0, 0, 210, 40, 'F'); 

    // Lado Esquerdo (Fixo da Loja)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Vunn", marginX, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Orçamento Comercial", marginX, 28);

    // --- LADO DIREITO SUPERIOR (DADOS DO AFILIADO/VENDEDOR) ---
    let telefoneFormatado = afiliado.telefone || "";
    
    doc.setFontSize(9);
    doc.text(`Consultor: ${afiliado.nome}`, 195, 15, { align: "right" });
    if(telefoneFormatado) {
        doc.text(`WhatsApp: ${telefoneFormatado}`, 195, 20, { align: "right" });
    }
    doc.text("CNPJ: 00.000.000/0001-00", 195, 30, { align: "right" });

    // --- 2. DADOS DO CLIENTE E DETALHES (AQUI MUDA!) ---
    y = 55;
    doc.setTextColor(0, 0, 0); // Volta para preto

    // === COLUNA ESQUERDA: DADOS DO CLIENTE (RECUPERADOS DOS INPUTS) ===
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO CLIENTE:", marginX, y); // Título
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    // Nome do Cliente
    doc.text(cliNome.toUpperCase(), marginX, y + 6);
    
    // Endereço (Com quebra de linha automática se for muito grande)
    const enderecoSplit = doc.splitTextToSize(cliEndereco, 90); // Quebra em 90mm
    doc.text(enderecoSplit, marginX, y + 11);
    
    // Calcula onde terminaram as linhas do endereço para colocar o telefone embaixo
    let alturaEndereco = enderecoSplit.length * 5; 
    let yAtual = y + 11 + alturaEndereco;

    if(cliTelefone) {
        doc.text(`Tel: ${cliTelefone}`, marginX, yAtual);
        yAtual += 5;
    }
    if(cliEmail) {
        doc.text(`Email: ${cliEmail}`, marginX, yAtual);
    }

    // === COLUNA DIREITA: DADOS DO ORÇAMENTO ===
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const validade = new Date(); validade.setDate(validade.getDate() + 5); 
    
    doc.setFont("helvetica", "bold");
    doc.text("DETALHES:", 120, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Data de Emissão: ${dataHoje}`, 120, y + 6);
    doc.text(`Validade: ${validade.toLocaleDateString('pt-BR')}`, 120, y + 11);
    
    // Repete o código do vendedor aqui também se quiser, ou deixa só lá em cima
    doc.text(`Vendedor: ${afiliado.codigo}`, 120, y + 16);


    // --- 3. TABELA DE PRODUTOS ---
    const colunas = ["QTD", "DESCRIÇÃO / PRODUTO", "UNITÁRIO", "TOTAL"];
    
    const linhas = itens.map(item => [
        item.qtd,
        item.nome, 
        formatarMoeda(item.unitario),
        formatarMoeda(item.total)
    ]);

    const totalGeral = itens.reduce((acc, item) => acc + item.total, 0);

    // Ajusta o Y da tabela para não bater no endereço do cliente
    let yTabela = Math.max(yAtual + 10, y + 25); 

    doc.autoTable({
        startY: yTabela,
        head: [colunas],
        body: linhas,
        theme: 'striped', 
        headStyles: { fillColor: corPrimaria, textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 }, 
            2: { halign: 'right', cellWidth: 35 },  
            3: { halign: 'right', cellWidth: 35 }   
        }
    });

    const finalY = doc.lastAutoTable.finalY + 10;

    // --- 4. TOTALIZADORES ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...corPrimaria);
    doc.text(`TOTAL A PAGAR: ${formatarMoeda(totalGeral)}`, 195, finalY, { align: "right" });

    // --- 5. LINK DE PAGAMENTO ---
    // Verifica se temos as funções de link disponíveis
    if(typeof gerarPayloadUrl === 'function') {
        const payload = gerarPayloadUrl();
        const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html';
        const linkPagamento = `${baseUrl}?restore=${payload}&ref=${afiliado.codigo}`;

        const btnY = finalY + 15;
        doc.setFillColor(...corSecundaria); 
        doc.roundedRect(marginX, btnY, 180, 12, 3, 3, 'F'); 
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text("CLIQUE AQUI PARA FINALIZAR A COMPRA ONLINE", 105, btnY + 8, { align: "center" });
        
        doc.link(marginX, btnY, 180, 12, { url: linkPagamento });
    }

    // --- 6. RODAPÉ ---
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text("Este orçamento não garante reserva de estoque até a confirmação do pagamento.", 105, 285, { align: "center" });
    
    const nomeLimpo = cliNome.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    doc.save(`Orcamento_${nomeLimpo}.pdf`);
}

// Função auxiliar caso não exista no seu escopo global
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function gerarPayloadUrl() {
    const itens = window.ITENS_CHECKOUT || [];
    
    const payload = itens.map(i => ({ 
        id: i.id, 
        ti: i.id_tiny || i.tinyId, // ✅ Adicionamos o Tiny ID (ti) aqui
        q: i.qtd,
        n: i.nome,
        m: i.customMargin,     // ✅ Enviamos a MARGEM real (ex: 25)
        pc: (i.unitario / (1 + (i.customMargin / 100))).toFixed(2) // ✅ Preço de Custo (150.00)
    }));
    
    return encodeURIComponent(JSON.stringify(payload));
}

// FINALIZAR PEDIDO (CLIENTE)
async function finalizarPedido(itens) {
    
    const email = document.getElementById('email').value;
    const rua = document.getElementById('rua').value;
    if(!email || !rua) return alert("Preencha dados.");

    let afiliadoCodigo = localStorage.getItem('afiliadoCodigo');
    const logado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (!afiliadoCodigo && logado && logado.codigo) afiliadoCodigo = logado.codigo;

    try {
        const body = { cliente: { nome: email, email: email, endereco: rua }, itens: itens, afiliadoCodigo: afiliadoCodigo };
        const res = await fetch(`${API_URL}/finalizar-pedido`, { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        if(res.ok) { alert("Pedido Realizado!"); localStorage.removeItem('nossoCarrinho'); window.location.href = 'index.html'; } 
        else alert("Erro ao finalizar.");
    } catch(e) { alert("Erro conexão."); }
}

// RESTO (Busca, Slider, etc - MANTIDOS)
function alterarQuantidade(id, delta) { let c = getCarrinho(); let i = c.find(p => p.id == id); if(i) { i.quantidade += delta; if(i.quantidade<=0) c = c.filter(p=>p.id!=id); localStorage.setItem('nossoCarrinho', JSON.stringify(c)); carregarPaginaCarrinho(); atualizarIconeCarrinho(); } }
function removerItem(id) { let c = getCarrinho().filter(p => p.id != id); localStorage.setItem('nossoCarrinho', JSON.stringify(c)); carregarPaginaCarrinho(); atualizarIconeCarrinho(); }
function setupGlobalSearch() {
    const btn = document.getElementById('search-button'); const input = document.getElementById('search-input');
    if(btn && input) { btn.onclick = (e) => { e.preventDefault(); fazerPesquisa(input.value, ''); }; input.addEventListener('keypress', (e) => { if(e.key === 'Enter') { e.preventDefault(); fazerPesquisa(input.value, ''); } }); }
    document.querySelectorAll('.category-card').forEach(link => { link.addEventListener('click', (e) => { let cat = link.dataset.categoria; if(!cat) cat = link.querySelector('span') ? link.querySelector('span').innerText : ''; const val = input ? input.value.trim() : ''; if(val !== '') { e.preventDefault(); fazerPesquisa(val, cat); } }); });
}
function fazerPesquisa(t, c) { window.location.href = `busca.html?q=${encodeURIComponent(t)}&categoria=${encodeURIComponent(c)}`; }
function setupSearchPage() { const params = new URLSearchParams(window.location.search); if(params.get('q') || params.get('categoria')) executarBusca(params.get('q'), params.get('categoria')); }
// Substitua sua função executarBusca por esta:

async function executarBusca(q, categoria) {
    try {
        let url = `${API_URL}/search?`;
        if (q) url += `q=${encodeURIComponent(q)}&`;
        if (categoria) url += `categoria=${encodeURIComponent(categoria)}`;

        const res = await fetch(url);
        const data = await res.json();
        const track = document.getElementById("search-track");
        
        const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
        const termoPesquisado = (q || '').toUpperCase().trim();

        if(!track) return;
        track.innerHTML = '';
        
        if (data.length === 0) {
            track.innerHTML = '<p style="padding:20px; width:100%; text-align:center;">Nenhum produto encontrado.</p>';
            return;
        }


        data.forEach(p => {
            // 1. Identifica a curva do produto (vem do banco/Tiny)
            const curvaRef = (p.categoria || 'CURVA A').toUpperCase();
            

            // 2. Lógica de Preço para o Afiliado
            let precoBase = parseFloat(p.price || p.preco_novo);
            let precoExibir = precoBase

            // 3. Lógica de Estoque (vinda do Tiny via Sincronização)
            const temEstoque = p.estoque > 0;
            const badgeEstoque = temEstoque 
                ? `<span style="color:#27ae60; font-size:0.75rem;"><i class="ph ph-check-circle"></i> Em estoque</span>`
                : `<span style="color:#e74c3c; font-size:0.75rem;"><i class="ph ph-warning-circle"></i> Esgotado</span>`;

            // 4. Lógica de Aplicação (Whitelist)
            let carroExibir = "";
            const arrayCarrosBanco = (p.carros || '').toUpperCase().split(',').map(c => c.trim()).filter(c => c !== "");
            
            if (termoPesquisado) {
                const matchFiel = LISTA_CARROS.find(carro => {
                    const regex = new RegExp(`\\b${carro}\\b`, 'i'); 
                    return regex.test(termoPesquisado) && p.carros.toUpperCase().includes(carro);
                });
                if (matchFiel) carroExibir = matchFiel;
            }
            if (!carroExibir && arrayCarrosBanco.length > 0) carroExibir = arrayCarrosBanco[0];

            const aplicacaoFinal = carroExibir ? `${carroExibir}${p.ano ? ' ('+p.ano+')' : ''}` : "UNIVERSAL";

            // 5. Renderização do Card
            const linkProduto = `product.html?id=${p.id}${q ? '&q=' + encodeURIComponent(q) : ''}`;
            
            track.innerHTML += `
            <a href="${linkProduto}" class="product-card" style="opacity: ${temEstoque ? '1' : '0.6'}">
                <div>
                    <div class="product-image">
                        <img src="${p.image || p.imagem}" onerror="this.src='https://placehold.co/150'">
                        <div style="position:absolute; top:5px; right:5px; background:rgba(255,255,255,0.8); padding:2px 5px; border-radius:3px; font-size:0.65rem; font-weight:bold;">
                            ${curvaRef}
                        </div>
                    </div>
                    <h3>${p.name || p.titulo}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <small style="color: #7f8c8d; font-size: 0.75rem;">Ref: ${p.referencia || p.id}</small>
                        ${badgeEstoque}
                    </div>
                    <div class="app-tag">
                        <i class="ph ph-car"></i> <span>${aplicacaoFinal}</span>
                    </div>
                </div>
                <div>
                    ${afiliadoLogado ? 
                        `<p class="price-new" style="margin-top:auto;">${formatarMoeda(precoExibir)}</p>` : 
                        `<p class="price-new" style="font-size:0.85rem; color:#777; margin-top:auto;"><i class="ph ph-lock-key"></i> Login p/ ver</p>`
                    }
                    <div class="btn-card-action" style="width:100%; margin-top:10px; background: ${temEstoque ? '#34495e' : '#bdc3c7'}">
                        ${temEstoque ? 'Ver Detalhes' : 'Indisponível'}
                    </div> 
                </div>
            </a>`;
        });
    } catch(e) { console.error("Erro busca:", e); }
}

// --- FUNÇÃO AUXILIAR: MONTA O NOME COM CONTEXTO (WHITELIST DE CARROS) ---
function montarNomeCompleto(itemDoLocalStorage, produtoDaApi) {
    // 1. Pega os dados básicos
    const ref = itemDoLocalStorage.referencia || produtoDaApi.referencia || '';
    const titulo = itemDoLocalStorage.tituloOriginal || produtoDaApi.name || produtoDaApi.titulo;
    const listaCarrosBanco = itemDoLocalStorage.listaCarros || produtoDaApi.carros || '';
    
    // O que o cliente digitou (ex: "Pastilha freio Gol G5")
    const termoBusca = (itemDoLocalStorage.termoPesquisa || '').toUpperCase(); 

    // 2. Lógica Inteligente (Busca na Lista de Carros)
    let carroAplicavel = '';

    if (termoBusca && termoBusca.trim() !== '') {
        // Verifica se algum carro da nossa lista está dentro da pesquisa
        // Ex: Se pesquisou "Kit Embreagem Palio 1.0", vai achar "PALIO"
        const carroEncontrado = LISTA_CARROS.find(carro => termoBusca.includes(carro));

        if (carroEncontrado) {
            carroAplicavel = carroEncontrado;
            
            // Opcional: Se quiser pegar detalhes extras digitados (ex: G5, 1.4, 2010)
            // Você pode tentar extrair o ano ou versão, mas só o modelo já resolve 90%
        }
    } 
    
    // 3. Fallback: Se não achou carro na pesquisa, pega o primeiro do banco
    if (!carroAplicavel && listaCarrosBanco) {
        carroAplicavel = listaCarrosBanco.split(',')[0].trim().toUpperCase();
    }

    // 4. Montagem Final do Texto
    let nomeFinal = titulo;

    if (ref) nomeFinal = `${ref} - ${nomeFinal}`;
    
    if (carroAplicavel) {
        nomeFinal += ` : ${carroAplicavel}`;
    }

    return nomeFinal;
}

function setupProductPage() { const pId = new URLSearchParams(window.location.search).get('id'); if(pId) { buscarProdutoPorId(pId); const btn = document.querySelector('.btn-add-cart'); const qtd = document.getElementById('quantity-input'); if(btn) { const n = btn.cloneNode(true); btn.parentNode.replaceChild(n, btn); n.addEventListener('click', () => { adicionarAoCarrinho(pId, qtd ? parseInt(qtd.value) : 1); }); } } }
async function buscarProdutoPorId(id) { 
    try { 
        const res = await fetch(`${API_URL}/products/${id}`); 
        const p = await res.json(); 
        
        // 🟢 INJETA O TINY ID NA MEMÓRIA GLOBAL DA PÁGINA
        window.currentProductTinyId = p.tinyId; 

        document.getElementById('product-title').textContent = p.name || p.titulo; 
        document.getElementById('main-product-image').src = p.image || p.imagem; 
        document.getElementById('product-price-new').textContent = formatarMoeda(parseFloat(p.price || p.preco_novo)); 
    } catch(e) { console.error("Erro ao carregar produto:", e); } 
}
async function buscarProdutosPromocao() {
    try {
        const res = await fetch(`${API_URL}/search?q=`);
        const data = await res.json();
        const track = document.getElementById("promocoes-track");
        
        // VERIFICAÇÃO DE LOGIN (Parte 2)
        const isLogado = localStorage.getItem('afiliadoLogado');
        
        if(track) {
            track.innerHTML = '';
            
            // Pega os 4 primeiros produtos
            data.slice(0, 4).forEach(p => {
                // Se logado: Preço. Se não: Cadeado.
                const htmlPreco = isLogado 
                    ? `<p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p>`
                    : `<p class="price-new" style="font-size:0.9rem; color:#777;"><i class="ph ph-lock-key"></i> Login p/ ver</p>`;
                
                track.innerHTML += `
                <a href="product.html?id=${p.id}" class="product-card">
                    <div class="product-image">
                        <img src="${p.image||p.imagem}" onerror="this.src='https://placehold.co/150'">
                    </div>
                    <h3>${p.name||p.titulo}</h3>
                    ${htmlPreco}
                    
                    <div class="btn-card-action">Oferta 🔥</div>
                </a>`;
            });
        }
    } catch(e) { console.error(e); }

}
async function carregarMargemDoCodigo(c) { try { const res = await fetch(`${API_URL}/afiliado/check/${c}`); if(res.ok) { const d = await res.json(); if(d.margem) FATOR_GLOBAL = 1 + (d.margem/100); } } catch(e) {} }
function ativarModoParceiro(afiliado) { const btnLogin = document.getElementById('btn-login-header'); if (btnLogin) { btnLogin.innerHTML = `<i class="ph ph-sign-out"></i><span>Sair</span>`; btnLogin.href = "#"; btnLogin.style.color = "#e67e22"; btnLogin.onclick = (e) => { e.preventDefault(); if(confirm(`Sair da conta de parceiro?`)) { localStorage.removeItem('afiliadoLogado'); localStorage.removeItem('minhaMargem'); window.location.reload(); } }; } const barraAntiga = document.getElementById('barra-parceiro'); if (barraAntiga) barraAntiga.remove(); const barra = document.createElement('div'); barra.id = "barra-parceiro"; barra.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 45px; background: linear-gradient(90deg, #1a252f 0%, #2c3e50 100%); color: white; z-index: 999999; display: flex; justify-content: space-between; align-items: center; padding: 0 5%; box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-family: sans-serif; box-sizing: border-box;`; barra.innerHTML = `<div style="display:flex; align-items:center; gap: 10px;"><div style="background:rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px; display:flex; align-items:center; gap:6px;"><span style="font-size: 1.1rem;">🦊</span><span style="font-size: 0.9rem; color: #ecf0f1;">Olá, <strong>${afiliado.nome}</strong></span></div><span style="font-size: 0.75rem; background:#27ae60; padding:2px 6px; border-radius:4px; font-weight:bold;">PARCEIRO ATIVO</span></div><a href="afiliado_dashboard.html" style="text-decoration: none; color: white; background: rgba(255,255,255,0.15); padding: 6px 15px; border-radius: 30px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.1);"><i class="ph ph-gauge"></i><span>Meu Painel</span></a>`; document.body.prepend(barra); document.body.style.paddingTop = "45px"; }
let slideIndex = 0; let slideInterval; function iniciarSlider() { const slides = document.querySelectorAll('.slide'); if(slides.length > 0) { mostrarSlide(slideIndex); slideInterval = setInterval(() => mudarSlide(1), 5000); } } function mudarSlide(n) { slideIndex += n; mostrarSlide(slideIndex); clearInterval(slideInterval); slideInterval = setInterval(() => mudarSlide(1), 5000); } function mostrarSlide(n) { const slides = document.querySelectorAll('.slide'); if (slides.length === 0) return; if (n >= slides.length) slideIndex = 0; if (n < 0) slideIndex = slides.length - 1; slides.forEach(slide => slide.classList.remove('active')); slides[slideIndex].classList.add('active'); } window.mudarSlide = mudarSlide; window.iniciarSlider = iniciarSlider;

function calcularTotalVisual(carrinho) {
    let total = 0;
    carrinho.forEach(item => {
        let precoBase = parseFloat(item.preco); // Preço salvo no carrinho
        let margem = item.customMargin || 0;
        
        // Aplica margem
        let precoComMargem = precoBase * (1 + (margem / 100));
        
        total += (precoComMargem * item.quantidade);
    });
    
    // Atualiza o HTML
    const elTotal = document.getElementById('cart-total');
    if(elTotal) elTotal.innerText = total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}

// 🟢 FUNÇÃO DE FINALIZAR COM ASAAS (ATUALIZADA COM SELEÇÃO DE PAGAMENTO)
// 🟢 FUNÇÃO DE FINALIZAR COM ASAAS E TINY (ATUALIZADA)
async function finalizarCompraAsaas() {
    // 1. PEGAR DADOS DO FORMULÁRIO
// 1. CAPTURA DOS INPUTS (Usando IDs que conferimos antes)
    const nome = document.getElementById('nome_cliente').value.trim(); 
    const emailContato = document.getElementById('input-email-contato')?.value.trim() || '';
    const telefone = document.getElementById('input-telefone')?.value.trim() || '';
    const endereco = document.getElementById('rua').value.trim(); 
    const numero = document.getElementById('numero')?.value.trim();
    const bairro = document.getElementById('input-bairro')?.value.trim();
    const cidadeInput = document.getElementById('input-cidade')?.value.trim();
    const ufInput = document.getElementById('uf')?.value.trim();
    const cep = document.getElementById('cep')?.value.trim() || "00000000";

    // 🔴 LOG DE TESTE NO NAVEGADOR (Aperte F12 para ver se aparece Maceió aqui)
    console.log("Dados capturados no site:", { cidadeInput, ufInput });

    // --- PROTEÇÃO PARA NÃO ENVIAR A PALAVRA "CIDADE" ---
    // Se o campo estiver vazio ou for a palavra "Cidade", usamos Maceio como fallback
    const cidade = (cidadeInput && cidadeInput.toLowerCase() !== "cidade") ? cidadeInput : "Maceio";
    const uf = (ufInput && ufInput.toLowerCase() !== "uf") ? ufInput.toUpperCase() : "AL";
    // ------------------------------------------

    // ... restante das validações de CPF e botões ...
    

    // Tenta pegar o CPF do campo de busca ou do input específico
    let doc = document.getElementById('input-doc-cliente')?.value;
    if (!doc) doc = document.getElementById('doc-busca')?.value;
    
    // Validações Básicas
    // 🔴 VALIDAÇÃO RIGOROSA (O Tiny exige isso)
    if (!nome || !endereco || !numero || !bairro || !cidadeInput || !ufInput) {
        return alert("⚠️ Por favor, preencha o endereço completo (Rua, Número, Bairro, Cidade e UF).");
    }

    if (!doc) {
        doc = prompt("CPF obrigatório para nota fiscal. Digite apenas números:");
        if(!doc) return;
        if(document.getElementById('doc-busca')) document.getElementById('doc-busca').value = doc;
    }

    // Limpa o CPF (deixa só números)
    const cpfLimpo = doc.replace(/\D/g,'');
    if (cpfLimpo.length < 11) return alert("CPF inválido.");

    // Atualiza botão para feedback visual
    const btn = document.getElementById('btn-finalizar-pix');
    if(btn) { btn.innerHTML = "Processando..."; btn.disabled = true; }

    const carrinho = JSON.parse(localStorage.getItem('nossoCarrinho') || '[]');

    try {
        // Pega a margem global salva (fallback)
        const margemGlobal = parseFloat(localStorage.getItem('minhaMargem') || 0);

        // Prepara os itens garantindo que a margem vá correta
        const itensParaEnviar = carrinho.map(i => {
            let margemFinal = (i.customMargin !== undefined && i.customMargin !== null) 
                              ? i.customMargin 
                              : margemGlobal;

            let precoBase = parseFloat(i.preco || i.preco_novo || 0);
            let precoComMargem = precoBase * (1 + (margemFinal / 100));  
            if (precoComMargem <= 0) precoComMargem = 0.01;              
            
            return { 
                id: i.id, 
                tinyId: i.tinyId || null, // ✅ AGORA PASSA O ID REAL DO TINY
                quantidade: i.quantidade,
                preco: precoComMargem.toFixed(2),
                customMargin: parseFloat(margemFinal)
            };
        });

        // Verifica se o cliente marcou a bolinha (radio button) do Cartão no HTML
        let metodoEscolhido = 'PIX'; 
        const radioCartao = document.getElementById('pagamento-cartao'); 
        let qtdeParcelas = 1;
        const selectParcelas = document.getElementById('parcelas-select'); // Verifique se o ID no HTML é esse mesmo
        
        if (radioCartao && radioCartao.checked) {
            metodoEscolhido = 'CARTAO';
            if (selectParcelas) {
                qtdeParcelas = parseInt(selectParcelas.value);
            }
        }

        console.log(`Enviando método: ${metodoEscolhido} | Parcelas: ${qtdeParcelas}x`);

        const payload = {
            cliente: { 
                nome: nome, 
                documento: cpfLimpo, 
                email: emailContato || 'cliente@sememail.com', 
                telefone: telefone, 
                endereco: endereco 
            },
            itens: itensParaEnviar,
            afiliadoId: null,
            afiliadoCodigo: null,
            metodoPagamento: metodoEscolhido,
            parcelasSelecionadas: qtdeParcelas
        };

        // Verifica se tem afiliado logado ou código de referência
        const afLogado = localStorage.getItem('afiliadoLogado');
        const refCode = localStorage.getItem('afiliadoCodigo');
        
        if(afLogado) {
            const dadosAf = JSON.parse(afLogado);
            payload.afiliadoId = dadosAf.id;
        } else if (refCode) {
            payload.afiliadoCodigo = refCode;
        }

        // ENVIA PARA O BACKEND (Pagamento)
        const API_URL = ''; // Ajuste se necessário
        const res = await fetch(`${API_URL}/api/checkout/pix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            // ✅ SUCESSO NO PAGAMENTO! AGORA DISPARAMOS O TINY EM PARALELO
            
            // 🔥 INTEGRAÇÃO TINY AQUI 🔥
            // Preparamos o objeto completo para a função criarPedidoNoTiny
            const dadosClienteTiny = {
                nome: nome,
                documento: doc.replace(/\D/g,''),
                email: emailContato,
                telefone: telefone,
                endereco: endereco,
                numero: numero || "0",
                bairro: bairro || "Centro",
                cep: cep,
                cidade: cidade, // Agora vai Maceio ou o que você digitou
                uf: uf          // Agora vai AL ou o que você digitou
            };

            // Chamamos a função sem 'await' para não travar a tela do usuário
            // O pedido será criado no Tiny em segundo plano
            if (typeof criarPedidoNoTiny === 'function') {
                criarPedidoNoTiny(dadosClienteTiny, carrinho).then(tinyId => {
                    console.log("🛒 Pedido Tiny processado. ID/Número: ", tinyId);
                });
            } else {
                console.warn("Função criarPedidoNoTiny não encontrada.");
            }
            // 🔥 FIM DA INTEGRAÇÃO TINY 🔥


            // Mostra o Modal com o Link/QR Code
            mostrarModalPix(data.pix, data.linkPagamento, metodoEscolhido);
            
            // Limpa o carrinho e avisa na tela
            localStorage.removeItem('nossoCarrinho');
            const containerBotoes = document.getElementById('container-botoes-dinamicos');
            if(containerBotoes) containerBotoes.innerHTML = '<p style="color:#27ae60; text-align:center; font-weight:bold;">Pedido Realizado com Sucesso!</p>';
        
        } else {
            // ERRO DO SERVIDOR
            alert("Erro: " + (data.erro || "Falha ao processar pedido."));
            if(btn) { btn.disabled = false; btn.innerHTML = "Tentar Novamente"; }
        }

        console.log("📤 PACOTE SENDO ENVIADO PRO SERVIDOR:", JSON.stringify(itensParaEnviar, null, 2));

    } catch (e) {
        // ERRO DE CONEXÃO
        console.error(e);
        alert("Erro de conexão com o servidor.");
        if(btn) { btn.disabled = false; btn.innerHTML = "Tentar Novamente"; }
    }

}

function mostrarModalPix(pixData, linkPagamento, metodoEscolhido) {
    // LOG DE DEBUG para conferência no F12
    console.log("Dados recebidos no Modal:", { pixData, metodoEscolhido });

    const imgPix = document.getElementById('pix-img');
    const txtCola = document.getElementById('pix-cola');
    const btnLink = document.getElementById('btn-link-pagamento');
    const btnCopiar = document.querySelector('button[onclick="copiarCodigo()"]');
    const titulo = document.querySelector('#modal-pix h3');
    const desc = document.querySelector('#modal-pix p');
    const modal = document.getElementById('modal-pix');

    if (!modal) return;

    // --- CONFIGURAÇÃO PARA CARTÃO ---
    if (metodoEscolhido === 'CARTAO') {
        if (titulo) titulo.innerText = "🚀 Quase lá!";
        if (desc) desc.innerText = "Clique no botão abaixo para finalizar seu pagamento com segurança via Cartão ou PIX no checkout.";
        
        if (imgPix) imgPix.style.display = 'none';
        if (txtCola) txtCola.style.display = 'none';
        if (btnCopiar) btnCopiar.style.display = 'none';

        if (linkPagamento && btnLink) {
            btnLink.href = linkPagamento;
            btnLink.style.display = 'block'; 
            btnLink.style.background = '#27ae60'; // Seu verde destaque
            btnLink.innerHTML = `<i class="ph ph-credit-card"></i> IR PARA PAGAMENTO (CARTÃO / PIX)`;
        }
    } 
    // --- CONFIGURAÇÃO PARA PIX DIRETO ---
    else {
        if (titulo) titulo.innerText = "⚡ Pagamento via PIX";
        if (desc) desc.innerText = "Escaneie o QR Code ou copie o código abaixo para confirmar sua compra na hora.";
        
        if (btnLink) btnLink.style.display = 'none';

        // Tratando a Imagem (QR Code) do Asaas
        if (imgPix && pixData) {
            const qrCode = pixData.encodedImage || (typeof pixData === 'string' ? null : pixData.image);
            if (qrCode) {
                imgPix.src = `data:image/png;base64, ${qrCode}`;
                imgPix.style.display = 'block';
            } else {
                imgPix.style.display = 'none';
            }
        }

        // Tratando o Código Copia e Cola
        if (txtCola && pixData) {
            const payload = pixData.payload || (typeof pixData === 'string' ? pixData : pixData.text);
            if (payload) {
                txtCola.innerText = payload;
                txtCola.style.display = 'block';
            } else {
                txtCola.innerText = "Erro ao carregar código. Tente novamente.";
            }
        }

        if (btnCopiar) btnCopiar.style.display = 'inline-block';
    }

    modal.style.display = 'flex';
}

function copiarCodigo() {
    const codigo = document.getElementById('pix-cola').innerText;
    navigator.clipboard.writeText(codigo).then(() => alert("Copiado!"));
}

// ============================================================
// 🧮 CALCULADORA DE LUCRO LÍQUIDO (ESTIMATIVA FRONTEND)
// ============================================================
// script.js

// script.js

function calcularSimulacaoLiquida(precoBase, margemPorcentagem, parcelas = 1) {
    const margem = parseFloat(margemPorcentagem);
    
    // 1. Preço Original (À Vista) - É aqui que o lucro é gerado
    const precoVendaAVista = precoBase * (1 + (margem / 100));
    const lucroBrutoOriginal = precoVendaAVista - precoBase;

    // 2. Cálculo dos Juros de Antecipação (Apenas para parcelas > 2)
    // Esse valor é cobrado do cliente, mas repassado integralmente para o custo financeiro
    let jurosAntecipacaoTotal = 0;
    if (parcelas > 2) {
        const taxaAntecipacaoEstimada = 0.0249; // Sua taxa de antecipação
        jurosAntecipacaoTotal = precoVendaAVista * (taxaAntecipacaoEstimada * (parcelas - 2));
    }

    // 3. Preço Final que o cliente paga na tela
    const precoFinalVenda = precoVendaAVista + jurosAntecipacaoTotal;

    // 4. Rateio de Taxas Operacionais (Impostos + Taxa Fixa Asaas)
    // Aplicado apenas sobre o lucro original da venda para não inflar a comissão
    const FATOR_TAXAS_OPERACIONAIS = 0.30; 
    const descontoTaxasOperacionais = lucroBrutoOriginal * FATOR_TAXAS_OPERACIONAIS;
    
    // 5. Lucro Líquido Real (Protegido)
    // O juros entra como "Ganho Bruto" mas sai como "Taxa", ficando neutro para o afiliado
    const lucroLiquidoFinal = lucroBrutoOriginal - descontoTaxasOperacionais;

    return {
        precoFinal: precoFinalVenda,
        valorParcela: precoFinalVenda / parcelas,
        lucroBruto: lucroBrutoOriginal, // Agora fixo no valor à vista
        taxasEstimadas: descontoTaxasOperacionais,
        lucroLiquido: lucroLiquidoFinal,
        jurosIncluso: jurosAntecipacaoTotal // Para controle interno
    };
}

// Adicione isso no seu script.js para mudar o texto do botão
document.addEventListener('change', (e) => {
    if (e.target.name === 'metodo-pagamento') {
        const btn = document.getElementById('btn-finalizar-pix');
        if (btn) {
            btn.innerHTML = e.target.id === 'pagamento-cartao' 
                ? '<i class="ph ph-credit-card"></i> Finalizar com Cartão' 
                : '<i class="ph ph-qr-code"></i> Finalizar e Gerar PIX';
        }
    }
});

// ============================================================
// 🏭 INTEGRAÇÃO TINY (Envia o pedido para o ERP)
// ============================================================
async function criarPedidoNoTiny(dadosCliente, carrinho) {
    console.log("📤 Sincronizando valor de venda com o Tiny...");

    try {
        const margemGlobal = parseFloat(localStorage.getItem('minhaMargem') || 0);

        const itensFormatados = carrinho.map(item => {
            // 1. Pega o preço base (Custo/Loja)
            const precoBase = parseFloat(item.preco || item.preco_novo || 0);
            
            // 2. Define a margem (prioriza a do item, senão usa a global)
            const margemFinal = (item.customMargin !== undefined && item.customMargin !== null) 
                                ? parseFloat(item.customMargin) 
                                : margemGlobal;

            // 3. CALCULA O PREÇO DE VENDA (O mesmo do Asaas)
            let precoVendaFinal = precoBase * (1 + (margemFinal / 100));
            
            // Proteção para nunca enviar valor zero ou negativo
            if (precoVendaFinal <= 0) precoVendaFinal = 0.01;

            return {
                id_tiny: item.tinyId || item.id,
                quantidade: item.quantidade,
                // ✅ Envia o preço já com o lucro do afiliado embutido
                preco: precoVendaFinal.toFixed(2) 
            };
        });

        const payload = {
            cliente: {
                nome: dadosCliente.nome,
                cpf: dadosCliente.documento,
                email: dadosCliente.email,
                telefone: dadosCliente.telefone,
                endereco: dadosCliente.endereco,
                numero: dadosCliente.numero || "0",
                bairro: dadosCliente.bairro || "Centro",
                cep: dadosCliente.cep || "00000000",
                cidade: dadosCliente.cidade,
                uf: dadosCliente.uf
            },
            itensCarrinho: itensFormatados,
            valorFrete: 0 
        };

        const response = await fetch(`${API_URL}/admin/tiny/criar-pedido`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resultado = await response.json();
        
        if (resultado.sucesso) {
            console.log("✅ Preço sincronizado no Tiny!");
            return resultado.numero;
        }
        return null;

    } catch (error) {
        console.error("❌ Erro ao enviar preço calculado para o Tiny:", error);
        return null;
    }
}
