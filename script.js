/* ==============================================================
   🚀 SCRIPT GERAL (SALVAMENTO AUTOMÁTICO NO CHECKOUT)
   ============================================================== */

const API_URL = ''; 
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

    if (item) {
        item.quantidade = (item.quantidade || 1) + qtd;
    } else {
        c.push({ id: parseInt(id), quantidade: qtd, customMargin: margemInicial });
    }
    
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
    alert("Adicionado ao carrinho!");
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
    if (restoreData) {
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            if (Array.isArray(itensResgatados)) localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.error("Erro link:", e); }
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
// 🛒 CARRINHO HÍBRIDO (TABELA PC + CARDS MOBILE)
// ==============================================================
async function carregarPaginaCarrinho() {
    if (!localStorage.getItem('afiliadoLogado')) {
        alert("Faça login."); window.location.href = "login.html"; return;
    }

    // Pega os DOIS containers
    const containerDesktop = document.getElementById('cart-items-desktop');
    const containerMobile  = document.getElementById('cart-items-mobile'); // Novo container
    
    // Elementos de totais
    const cartTotalElement = document.getElementById('cart-total');
    const cartSubtotalElement = document.getElementById('cart-subtotal');
    const rowLucro = document.getElementById('row-afiliado-lucro');
    const valorLucro = document.getElementById('afiliado-lucro-valor');

    if (!containerDesktop) return;

    let cart = getCarrinho();
    
    // Limpa ambos
    containerDesktop.innerHTML = ''; 
    if(containerMobile) containerMobile.innerHTML = '';
    
    let totalVenda = 0;
    let totalLucro = 0; 
    const isAfiliado = !!localStorage.getItem('afiliadoLogado');

    // Carrinho Vazio
    if (cart.length === 0) {
        containerDesktop.innerHTML = '<tr><td colspan="6" align="center">Vazio</td></tr>';
        if(containerMobile) containerMobile.innerHTML = '<div style="text-align:center; padding:20px;">Seu carrinho está vazio.</div>';
        return;
    }

    // LOOP GERA O HTML DUPLO
    for (const item of cart) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();
            const nomeExibir = montarNomeCompleto(item, p);

            // Cálculos
            const precoBase = parseFloat(p.price || p.preco_novo);
            let margem = (item.customMargin !== undefined) ? item.customMargin : ((FATOR_GLOBAL - 1) * 100);
            const precoFinal = precoBase * (1 + (margem / 100));
            const subtotal = precoFinal * item.quantidade;
            const lucroItem = (precoFinal - precoBase) * item.quantidade;

            totalVenda += subtotal;
            totalLucro += lucroItem;

            // --- 1. GERA LINHA DA TABELA (DESKTOP) ---
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${p.image||p.imagem}" width="60"></td>
                <td>
                    ${nomeExibir} <br>
                    ${isAfiliado ? `<small style="color:#e67e22">Lucro: <input type="number" value="${margem}" style="width:50px" onchange="atualizarMargemCarrinho(${item.id}, this.value)">%</small>` : ''}
                </td>
                <td>${formatarMoeda(precoFinal)}</td>
                <td>
                    <button onclick="alterarQuantidade(${item.id}, -1)">-</button>
                    ${item.quantidade}
                    <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                </td>
                <td>${formatarMoeda(subtotal)}</td>
                <td><button onclick="removerItem(${item.id})" style="color:red">X</button></td>
            `;
            containerDesktop.appendChild(tr);

            // --- 2. GERA CARD (MOBILE) - SEM TABELAS! ---
            if(containerMobile) {
                const card = document.createElement('div');
                card.className = 'mobile-cart-card';
                card.innerHTML = `
                    <img src="${p.image||p.imagem}" class="mobile-cart-img">
                    <div class="mobile-cart-title">${nomeExibir}</div>
                    
                    ${isAfiliado ? `
                    <div class="mobile-lucro-box">
                        <strong>Lucro:</strong>
                        <input type="number" value="${margem}" onchange="atualizarMargemCarrinho(${item.id}, this.value)"> %
                    </div>` : ''}

                    <div class="mobile-cart-details">
                        <div>
                            <div style="font-size:0.8rem; color:#888;">Preço Unit.</div>
                            <div style="font-weight:bold;">${formatarMoeda(precoFinal)}</div>
                        </div>
                        <div class="mobile-qty-box">
                            <button onclick="alterarQuantidade(${item.id}, -1)">-</button>
                            <strong>${item.quantidade}</strong>
                            <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                        </div>
                    </div>

                    <div style="margin-top:15px; font-size:1.2rem; color:#27ae60; font-weight:800;">
                        Total: ${formatarMoeda(subtotal)}
                    </div>

                    <button class="mobile-remove-btn" onclick="removerItem(${item.id})">
                        Remover Item
                    </button>
                `;
                containerMobile.appendChild(card);
            }

        } catch (e) {}
    }

    // Totais e Botão Limpar (Adiciona no final de cada container)
    // ... (lógica de totais permanece igual) ...
    if (cartTotalElement) cartTotalElement.innerText = formatarMoeda(totalVenda);
    if (cartSubtotalElement) cartSubtotalElement.innerText = formatarMoeda(totalVenda);
    
    if (isAfiliado && rowLucro) {
        rowLucro.style.display = 'flex';
        valorLucro.innerText = formatarMoeda(totalLucro);
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
        window.location.href = "login.html"; // Ou index.html
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
            const precoBase = parseFloat(p.price || p.preco_novo);
            
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
        btnPagar.className = "btn-place-order"; 
        btnPagar.innerHTML = `✅ Finalizar Pedido`;
        btnPagar.onclick = () => finalizarPedido(itensParaProcessar); 
        container.appendChild(btnPagar);
    }
    
    if(areaBotoes) areaBotoes.appendChild(container);
    
    // Esconde o botão original do template (HTML estático) se existir
    const btnOriginal = document.querySelector('.btn-place-order:not(#container-botoes-dinamicos button)');
    if(btnOriginal) btnOriginal.style.display = 'none';
}

// --- FUNÇÃO "SILENCIOSA" PARA SALVAR ORÇAMENTO --- 
async function salvarOrcamentoSilencioso(tipo) {
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if(!afiliado || !afiliado.token) return;

    // Tenta pegar o nome do input "Nome" (se tiver preenchido)
    // Se não tiver, gera um nome automático: "Orçamento WhatsApp - 29/11 10:30"
    const inputNome = document.getElementById('email'); // Usando o campo email/nome do form
    let nomeCliente = inputNome ? inputNome.value.trim() : "";
    
    const dataHora = new Date().toLocaleString('pt-BR', {day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'});
    
    let nomeFinal = nomeCliente ? `${nomeCliente} (${tipo})` : `Orçamento ${tipo} - ${dataHora}`;

    const carrinho = getCarrinho(); 
    if(carrinho.length === 0) return;

    // Feedback visual rápido (troca texto do botão)
    const btnId = tipo === 'WhatsApp' ? 'btn-zap' : 'btn-pdf';
    const btn = document.getElementById(btnId);
    let textoOriginal = "";
    if(btn) {
        textoOriginal = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-spinner"></i> Salvando...`;
    }

    try {
        await fetch(`${API_URL}/orcamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${afiliado.token}` },
            body: JSON.stringify({ nome: nomeFinal, itens: carrinho, total: 0 })
        });
        console.log("✅ Orçamento salvo automaticamente: " + nomeFinal);
    } catch(e) { 
        console.error("Erro ao salvar auto", e); 
    } finally {
        if(btn) btn.innerHTML = textoOriginal; // Restaura botão
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
    
    let msg = `*Orçamento AutoPeças Veloz*\n`; 
    window.ITENS_CHECKOUT.forEach(i => { msg += `${i.qtd}x ${i.nome} - ${formatarMoeda(i.total)}\n`; });
    msg += `*Total: ${formatarMoeda(total)}*\n\n`;
    msg += `Pague aqui: ${link}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

async function gerarPDFCustom() {
    // 1. Salva Primeiro (Manteve sua lógica original)
    await salvarOrcamentoSilencioso('PDF');

    // 2. Verifica bibliotecas
    if (!window.jspdf || !window.jspdf.jsPDF) return alert("Erro: Biblioteca PDF não carregada.");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    const itens = window.ITENS_CHECKOUT || []; // Pega os itens já formatados (com nome do carro)

    // --- CONFIGURAÇÕES DE DESIGN ---
    const corPrimaria = [44, 62, 80];   // Azul Escuro (#2c3e50)
    const corSecundaria = [230, 126, 34]; // Laranja (#e67e22)
    const marginX = 15;
    let y = 0; // Cursor vertical

   // --- DENTRO DE gerarPDFCustom NO SCRIPT.JS ---

    // ... (Parte do Fundo Azul continua igual) ...
    doc.setFillColor(...corPrimaria);
    doc.rect(0, 0, 210, 40, 'F'); 

    // Lado Esquerdo (Fixo da Loja)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("AutoPeças Veloz", marginX, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Orçamento Personalizado", marginX, 28);

    // --- LADO DIREITO (DADOS DO AFILIADO/VENDEDOR) ---
    // Formata o telefone (ex: 8299999999 -> (82) 99999-9999)
    let telefoneFormatado = afiliado.telefone || "Não informado";
    if (telefoneFormatado.length >= 10) {
        telefoneFormatado = `(${telefoneFormatado.slice(0,2)}) ${telefoneFormatado.slice(2,7)}-${telefoneFormatado.slice(7)}`;
    }

    doc.setFontSize(9);
    // Aqui colocamos o Nome como "Contato" e o Telefone abaixo
    doc.text(`Consultor: ${afiliado.nome}`, 195, 15, { align: "right" });
    doc.text(`WhatsApp: ${telefoneFormatado}`, 195, 20, { align: "right" });
    
    // Se quiser inventar um e-mail baseado no código, descomente a linha abaixo:
    // doc.text(`Email: ${afiliado.codigo}@autopecasveloz.com.br`, 195, 25, { align: "right" });
    
    // CNPJ Fixo da Empresa (bom manter para credibilidade)
    doc.text("CNPJ: 00.000.000/0001-00", 195, 30, { align: "right" });

    // --- 2. INFORMAÇÕES DO ORÇAMENTO ---
    y = 55;
    doc.setTextColor(0, 0, 0); // Volta para preto

    // Coluna Esquerda: Consultor
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("CONSULTOR:", marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text((afiliado.nome || "Vendedor").toUpperCase(), marginX, y + 6);
    doc.text(`Código: ${afiliado.codigo}`, marginX, y + 11);

    // Coluna Direita: Dados do Pedido
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const validade = new Date(); validade.setDate(validade.getDate() + 5); // Validade +5 dias
    
    doc.setFont("helvetica", "bold");
    doc.text("DETALHES DO ORÇAMENTO:", 120, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Data de Emissão: ${dataHoje}`, 120, y + 6);
    doc.text(`Validade: ${validade.toLocaleDateString('pt-BR')}`, 120, y + 11);

    // --- 3. TABELA DE PRODUTOS (Mágica do AutoTable) ---
    const colunas = ["QTD", "DESCRIÇÃO / PRODUTO", "UNITÁRIO", "TOTAL"];
    
    // Prepara os dados para a tabela
    const linhas = itens.map(item => [
        item.qtd,
        item.nome, // Já vem com "Ref: Carro" graças à sua função anterior!
        formatarMoeda(item.unitario),
        formatarMoeda(item.total)
    ]);

    // Calcula Total Geral
    const totalGeral = itens.reduce((acc, item) => acc + item.total, 0);

    doc.autoTable({
        startY: y + 20,
        head: [colunas],
        body: linhas,
        theme: 'striped', // Estilo zebrado (cinza/branco)
        headStyles: { fillColor: corPrimaria, textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 }, // Qtd
            2: { halign: 'right', cellWidth: 35 },  // Unit
            3: { halign: 'right', cellWidth: 35 }   // Total
        }
    });

    // Pega a posição Y onde a tabela terminou
    const finalY = doc.lastAutoTable.finalY + 10;

    // --- 4. TOTALIZADORES ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...corPrimaria);
    doc.text(`TOTAL A PAGAR: ${formatarMoeda(totalGeral)}`, 195, finalY, { align: "right" });

    // --- 5. LINK DE PAGAMENTO ---
    const payload = gerarPayloadUrl();
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html';
    const linkPagamento = `${baseUrl}?restore=${payload}&ref=${afiliado.codigo}`;

    // Desenha um "Botão" no PDF
    const btnY = finalY + 15;
    doc.setFillColor(...corSecundaria); // Laranja
    doc.roundedRect(marginX, btnY, 180, 12, 3, 3, 'F'); // Caixa do botão
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("CLIQUE AQUI PARA FINALIZAR A COMPRA ONLINE", 105, btnY + 8, { align: "center" });
    
    // Adiciona o link real sobre a área do botão
    doc.link(marginX, btnY, 180, 12, { url: linkPagamento });

    // --- 6. RODAPÉ ---
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text("Este orçamento não garante reserva de estoque até a confirmação do pagamento.", 105, 285, { align: "center" });
    
    // Salva o arquivo
    const nomeArquivo = `Orcamento_${afiliado.nome.split(' ')[0]}_${Date.now()}.pdf`;
    doc.save(nomeArquivo);
}

function gerarPayloadUrl() {
    const itens = window.ITENS_CHECKOUT || [];
    const payload = itens.map(i => ({ id: i.id, quantidade: i.qtd, customMargin: i.customMargin }));
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
async function executarBusca(q, categoria) {
    try {
        let url = `${API_URL}/search?`;
        if (q) url += `q=${encodeURIComponent(q)}&`;
        if (categoria) url += `categoria=${encodeURIComponent(categoria)}`;

        const res = await fetch(url);
        const data = await res.json();
        const track = document.getElementById("search-track");
        
        // VERIFICAÇÃO DE LOGIN
        const isLogado = localStorage.getItem('afiliadoLogado');
        
        if(track) {
            track.innerHTML = '';
            
            if (data.length === 0) {
                track.innerHTML = '<p style="padding:20px; width:100%; text-align:center;">Nenhum produto encontrado.</p>';
                return;
            }

            data.forEach(p => {
                // Se logado: Preço. Se não: Cadeado.
                const htmlPreco = isLogado 
                    ? `<p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p>`
                    : `<p class="price-new" style="font-size:0.9rem; color:#777;"><i class="ph ph-lock-key"></i> Login p/ ver</p>`;

                const textoBotao = isLogado ? 'Ver Detalhes' : 'Entrar';

                // 🔥 CORREÇÃO AQUI: Passar o termo pesquisado para o link 🔥
                // Se 'q' existir, adiciona "&q=..." ao final do link
                const termoParaLink = q ? `&q=${encodeURIComponent(q)}` : '';

                track.innerHTML += `
                <a href="product.html?id=${p.id}${termoParaLink}" class="product-card">
                    <div class="product-image">
                        <img src="${p.image||p.imagem}" onerror="this.src='https://placehold.co/150'">
                    </div>
                    <h3>${p.name||p.titulo}</h3>
                    ${htmlPreco}
                    
                    <div class="btn-card-action">${textoBotao}</div> 
                </a>`;
            });
        }
    } catch(e){
        console.error("Erro busca:", e);
    }
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
async function buscarProdutoPorId(id) { try { const res = await fetch(`${API_URL}/products/${id}`); const p = await res.json(); document.getElementById('product-title').textContent = p.name || p.titulo; document.getElementById('main-product-image').src = p.image || p.imagem; document.getElementById('product-price-new').textContent = formatarMoeda(parseFloat(p.price || p.preco_novo)); } catch(e) {} }
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
function ativarModoParceiro(afiliado) { const btnLogin = document.getElementById('btn-login-header'); if (btnLogin) { btnLogin.innerHTML = `<i class="ph ph-sign-out"></i><span>Sair</span>`; btnLogin.href = "#"; btnLogin.style.color = "#e67e22"; btnLogin.onclick = (e) => { e.preventDefault(); if(confirm(`Sair da conta de parceiro?`)) { localStorage.removeItem('afiliadoLogado'); localStorage.removeItem('minhaMargem'); window.location.reload(); } }; } const barraAntiga = document.getElementById('barra-parceiro'); if (barraAntiga) barraAntiga.remove(); const barra = document.createElement('div'); barra.id = "barra-parceiro"; barra.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 45px; background: linear-gradient(90deg, #1a252f 0%, #2c3e50 100%); color: white; z-index: 999999; display: flex; justify-content: space-between; align-items: center; padding: 0 5%; box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-family: sans-serif; box-sizing: border-box;`; barra.innerHTML = `<div style="display:flex; align-items:center; gap: 10px;"><div style="background:rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px; display:flex; align-items:center; gap:6px;"><span style="font-size: 1.1rem;">🦊</span><span style="font-size: 0.9rem; color: #ecf0f1;">Olá, <strong>${afiliado.nome}</strong></span></div><span style="font-size: 0.75rem; background:#27ae60; padding:2px 6px; border-radius:4px; font-weight:bold;">PARCEIRO ATIVO</span></div><a href="afiliado_dashboard.html" style="text-decoration: none; color: white; background: rgba(255,255,255,0.15); padding: 6px 15px; border-radius: 30px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.1);"><i class="ph ph-gauge"></i><span>Acessar Meu Painel</span></a>`; document.body.prepend(barra); document.body.style.paddingTop = "45px"; }
let slideIndex = 0; let slideInterval; function iniciarSlider() { const slides = document.querySelectorAll('.slide'); if(slides.length > 0) { mostrarSlide(slideIndex); slideInterval = setInterval(() => mudarSlide(1), 5000); } } function mudarSlide(n) { slideIndex += n; mostrarSlide(slideIndex); clearInterval(slideInterval); slideInterval = setInterval(() => mudarSlide(1), 5000); } function mostrarSlide(n) { const slides = document.querySelectorAll('.slide'); if (slides.length === 0) return; if (n >= slides.length) slideIndex = 0; if (n < 0) slideIndex = slides.length - 1; slides.forEach(slide => slide.classList.remove('active')); slides[slideIndex].classList.add('active'); } window.mudarSlide = mudarSlide; window.iniciarSlider = iniciarSlider;