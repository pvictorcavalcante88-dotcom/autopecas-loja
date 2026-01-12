const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

// ============================================================
// INICIALIZAÇÃO E DATAS
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
    
    // CONFIGURAÇÃO DAS DATAS PADRÃO
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    const hojeStr = hoje.toISOString().split('T')[0];
    const primeiroDiaStr = primeiroDia.toISOString().split('T')[0];

    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    if(elInicio) elInicio.value = primeiroDiaStr;
    if(elFim) elFim.value = hojeStr;

    const filtroInicio = document.getElementById('filtro-inicio');
    const filtroFim = document.getElementById('filtro-fim');
    if(filtroInicio) filtroInicio.value = primeiroDiaStr;
    if(filtroFim) filtroFim.value = hojeStr;
});

let AFILIADO_TOKEN = null;
window.TODAS_VENDAS = []; 

function verificarLogin() {
    const dadosAntigos = localStorage.getItem('afiliadoLogado');
    const tokenSimples = localStorage.getItem('afiliadoToken');

    if (dadosAntigos) {
        const dados = JSON.parse(dadosAntigos);
        AFILIADO_TOKEN = dados.token;
    } else if (tokenSimples) {
        AFILIADO_TOKEN = tokenSimples;
    } else {
        window.location.href = 'index.html'; 
        return;
    }

    const btnSair = document.getElementById('logout-btn');
    if(btnSair) {
        btnSair.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('afiliadoLogado');
            localStorage.removeItem('afiliadoToken');
            localStorage.removeItem('minhaMargem');
            window.location.href = 'index.html';
        }
    }

    carregarDashboardCompleto();
    carregarMeusOrcamentos();
    carregarMeusClientes();
    carregarMeusSaques();
    iniciarNotificacoes();
    carregarClientesCadastrados();
}

// ============================================================
// 1. CARREGAR DADOS DO DASHBOARD
// ============================================================
async function carregarDashboardCompleto() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados");

        const dados = await res.json();

        window.TODAS_VENDAS = dados.vendas || [];
        
        const elNome = document.getElementById('nome-afiliado');
        if(elNome) elNome.innerText = `Olá, ${dados.nome}!`;

        const elSaldo = document.getElementById('saldo-total');
        if(elSaldo) elSaldo.innerText = parseFloat(dados.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

        const elQtd = document.getElementById('qtd-vendas');
        if(elQtd && dados.vendas) {
            const aprovadas = dados.vendas.filter(v => ['APROVADO','ENTREGUE','DEVOLUCAO_PARCIAL'].includes(v.status)).length;
            elQtd.innerText = aprovadas;
        }

        const elLink = document.getElementById('link-afiliado');
        if(elLink && dados.codigo) {
            elLink.value = `${window.location.origin}/index.html?ref=${dados.codigo}`;
        }

        if(document.getElementById('input-pix')) document.getElementById('input-pix').value = dados.chavePix || '';
        if(document.getElementById('input-banco')) document.getElementById('input-banco').value = dados.banco || '';
        if(document.getElementById('input-agencia')) document.getElementById('input-agencia').value = dados.agencia || '';
        if(document.getElementById('input-conta')) document.getElementById('input-conta').value = dados.conta || '';

        calcularVendasPorPeriodo(); 
        preencherTabelaVendas('lista-ultimas-vendas', dados.vendas.slice(0, 5)); 
        preencherTabelaVendas('lista-todas-vendas', dados.vendas); 

    } catch (error) {
        console.error("Erro Fatal:", error);
    }
}

// ============================================================
// 🟢 CÁLCULO DO WIDGET (ATUALIZADO COM LUCRO)
// ============================================================
function calcularVendasPorPeriodo() {
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    const elTotalVendas = document.getElementById('total-periodo-valor');
    const elTotalLucro = document.getElementById('total-periodo-lucro'); // Novo elemento
    
    if(!elInicio || !elFim) return;

    const inicioStr = elInicio.value; 
    const fimStr = elFim.value;

    if (!inicioStr || !fimStr) return;

    let totalVendaPeriodo = 0;
    let totalLucroPeriodo = 0;

    if (window.TODAS_VENDAS) {
        window.TODAS_VENDAS.forEach(v => {
            if (['APROVADO','ENTREGUE','DEVOLUCAO_PARCIAL'].includes(v.status)) {
                
                const dataObj = new Date(v.createdAt);
                const ano = dataObj.getFullYear();
                const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
                const dia = String(dataObj.getDate()).padStart(2, '0');
                const dataVendaStr = `${ano}-${mes}-${dia}`;

                if (dataVendaStr >= inicioStr && dataVendaStr <= fimStr) {
                    totalVendaPeriodo += parseFloat(v.valorTotal || 0);
                    totalLucroPeriodo += parseFloat(v.comissaoGerada || 0); // Soma o lucro líquido
                }
            }
        });
    }

    if(elTotalVendas) elTotalVendas.innerText = totalVendaPeriodo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    if(elTotalLucro) elTotalLucro.innerText = totalLucroPeriodo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

function filtrarHistoricoVendas() {
    const inicioVal = document.getElementById('filtro-inicio').value;
    const fimVal = document.getElementById('filtro-fim').value;

    if (!inicioVal || !fimVal) {
        alert("Selecione as datas para filtrar.");
        return;
    }

    if (window.TODAS_VENDAS.length > 0) {
        const filtradas = window.TODAS_VENDAS.filter(v => {
            const dataObj = new Date(v.createdAt);
            const ano = dataObj.getFullYear();
            const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
            const dia = String(dataObj.getDate()).padStart(2, '0');
            const dataVendaStr = `${ano}-${mes}-${dia}`;
            return dataVendaStr >= inicioVal && dataVendaStr <= fimVal;
        });

        preencherTabelaVendas('lista-todas-vendas', filtradas);
    } else {
        preencherTabelaVendas('lista-todas-vendas', []);
    }
}

function limparFiltroVendas() {
    document.getElementById('filtro-inicio').value = '';
    document.getElementById('filtro-fim').value = '';
    preencherTabelaVendas('lista-todas-vendas', window.TODAS_VENDAS);
}

// ============================================================
// RENDERIZAÇÃO DE TABELAS (COM INDICADOR DE LÍQUIDO)
// ============================================================
function preencherTabelaVendas(elementId, vendas) {
    const tbody = document.getElementById(elementId);
    if(!tbody) return;

    tbody.innerHTML = ''; 

    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">Nenhuma venda neste período.</td></tr>';
        return;
    }

    vendas.forEach(v => {
        const data = new Date(v.createdAt).toLocaleDateString('pt-BR');
        const valor = parseFloat(v.valorTotal).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        const comissao = parseFloat(v.comissaoGerada || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        let statusStyle = "background:#eee; color:#333;";
        if(v.status === 'APROVADO') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'ENTREGUE') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'PENDENTE') statusStyle = "background:#fff3cd; color:#856404;";
        if(v.status === 'CANCELADO') statusStyle = "background:#f8d7da; color:#721c24;";
        if(v.status === 'PAGO') statusStyle = "background:#cce5ff; color:#004085;";
        if(v.status === 'DEVOLUCAO_PARCIAL') statusStyle = "background:#e1bee7; color:#4a148c;";

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data}</td>
            <td>${v.clienteNome || 'Cliente'}</td>
            <td>${valor}</td>
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span style="color:#27ae60; font-weight:bold;">+ ${comissao}</span>
                    <span style="font-size:0.7rem; color:#95a5a6;">Líquido</span>
                </div>
            </td>
            <td><span style="padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold; ${statusStyle}">${v.status || 'PENDENTE'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// OUTRAS FUNÇÕES (MANTIDAS IGUAIS)
// ============================================================

async function carregarMeusOrcamentos() {
    const tbody = document.getElementById('lista-orcamentos-salvos');
    if(!tbody) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/orcamentos`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const lista = await res.json();
        tbody.innerHTML = '';
        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#7f8c8d;">Nenhum orçamento salvo.</td></tr>';
            return;
        }
        lista.forEach(orc => {
            const data = new Date(orc.createdAt).toLocaleDateString('pt-BR');
            const totalDisplay = orc.total > 0 ? parseFloat(orc.total).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : "Sob Consulta";
            const docCliente = orc.clienteDoc ? `'${orc.clienteDoc}'` : 'null';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${orc.nome}</strong><br>
                    ${orc.clienteDoc ? `<small style="color:#2980b9;">Doc: ${orc.clienteDoc}</small>` : ''}
                </td>
                <td>${data}</td>
                <td style="color:#27ae60;">${totalDisplay}</td>
                <td>
                    <button onclick="restaurarOrcamento('${encodeURIComponent(orc.itens)}', ${docCliente})" style="background:#3498db; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-right:5px;" title="Carregar">
                        <i class="ph ph-shopping-cart"></i> Abrir
                    </button>
                    <button onclick="excluirOrcamento(${orc.id})" style="background:#c0392b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

function restaurarOrcamento(itensEncoded, clienteDoc) {
    if(!confirm("Isso vai substituir o carrinho atual pelo deste orçamento. Continuar?")) return;
    try {
        const itensString = decodeURIComponent(itensEncoded);
        JSON.parse(itensString);
        localStorage.setItem('nossoCarrinho', itensString);
        if (clienteDoc && clienteDoc !== 'null') {
            localStorage.setItem('tempClienteDoc', clienteDoc);
        } else {
            localStorage.removeItem('tempClienteDoc');
        }
        window.location.href = 'checkout.html'; 
    } catch(e) { console.error(e); alert("Erro ao carregar itens."); }
}

async function excluirOrcamento(id) {
    if(!confirm("Deseja excluir este orçamento?")) return;
    try {
        await fetch(`${API_URL}/orcamentos/${id}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        carregarMeusOrcamentos();
    } catch(e) { alert("Erro ao excluir"); }
}

async function carregarMeusClientes() {
    const tbody = document.getElementById('lista-clientes');
    if(!tbody) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/meus-clientes`, { headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
        const clientes = await res.json();
        tbody.innerHTML = '';
        if (!clientes || clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" align="center" style="padding:20px;">Nenhum cliente ainda.</td></tr>';
            return;
        }
        clientes.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.nome}</strong></td>
                <td>${c.email}<br>${c.telefone ? `<small>📞 ${c.telefone}</small>` : ''}</td>
                <td>${parseFloat(c.totalGasto).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

async function carregarMeusSaques() {
    const tbody = document.getElementById('lista-saques');
    if(!tbody) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/saques`, { headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
        const saques = await res.json();
        tbody.innerHTML = '';
        if (!saques || saques.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:#777; padding:15px;">Nenhum saque solicitado.</td></tr>';
            return;
        }
        saques.forEach(s => {
            const dataSol = new Date(s.dataSolicitacao).toLocaleDateString('pt-BR');
            const dataPag = s.dataPagamento ? new Date(s.dataPagamento).toLocaleDateString('pt-BR') : '-';
            const valor = parseFloat(s.valor).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
            let statusBadge = `<span style="background:#fff3cd; color:#856404; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PENDENTE ⏳</span>`;
            if(s.status === 'PAGO') statusBadge = `<span style="background:#d4edda; color:#155724; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PAGO ✅</span>`;
            
            let btnComprovante = '-';
            if (s.comprovante) {
                const link = s.comprovante.replace(/\\/g, '/');
                btnComprovante = `<a href="${API_URL}/${link}" target="_blank" style="background:#3498db; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8rem;">Ver</a>`;
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${dataSol}</td><td><strong>${valor}</strong></td><td>${dataPag}</td><td>${statusBadge}</td><td>${btnComprovante}</td>`;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

async function solicitarSaque() {
    if(!confirm("Deseja solicitar o saque de todo o saldo disponível?")) return;
    const btn = document.getElementById('btn-saque'); 
    if(btn) btn.innerText = "Processando...";
    try {
        const res = await fetch(`${API_URL}/afiliado/saque`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const data = await res.json();
        if (res.ok) {
            alert("✅ Solicitação Enviada! Valor: R$ " + parseFloat(data.valor).toFixed(2));
            carregarDashboardCompleto();
        } else {
            alert("Atenção: " + (data.erro || "Falha ao solicitar."));
        }
    } catch (e) { alert("Erro de conexão."); } 
    finally { if(btn) btn.innerText = "Solicitar Saque"; }
}

async function salvarDadosBancarios() {
    const dados = {
        chavePix: document.getElementById('input-pix').value,
        banco: document.getElementById('input-banco').value,
        agencia: document.getElementById('input-agencia').value,
        conta: document.getElementById('input-conta').value
    };
    try {
        const res = await fetch(`${API_URL}/afiliado/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_TOKEN}` },
            body: JSON.stringify(dados)
        });
        if(res.ok) alert("✅ Dados salvos!");
        else alert("Erro ao salvar.");
    } catch(e) { alert("Erro de conexão."); }
}

function mudarAba(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById(abaId);
    const nav = document.getElementById('nav-' + abaId);
    if(tab) tab.classList.add('active');
    if(nav) nav.classList.add('active');
}

// NOTIFICAÇÕES
function iniciarNotificacoes() { verificarNotificacoes(); setInterval(verificarNotificacoes, 15000); }
async function verificarNotificacoes() {
    if(!AFILIADO_TOKEN) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/notificacoes`, { headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
        if(!res.ok) return;
        const dados = await res.json();
        const total = dados.mensagens.length + dados.vendas.length;
        const badge = document.getElementById('notif-badge');
        const lista = document.getElementById('notif-list');
        if(badge) { badge.style.display = total > 0 ? 'block' : 'none'; badge.innerText = total > 9 ? '9+' : total; }
        if(!lista) return;
        lista.innerHTML = '';
        if(total === 0) { lista.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:0.9rem;">Sem novidades. 💤</div>'; return; }
        
        dados.vendas.forEach(v => {
            lista.innerHTML += `<div class="notif-item" style="border-left: 4px solid #27ae60;"><i class="ph ph-currency-circle-dollar" style="color:#27ae60;"></i><div><strong>Venda!</strong><br>${parseFloat(v.valorTotal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></div>`;
        });
        dados.mensagens.forEach(m => {
            lista.innerHTML += `<div class="notif-item" style="border-left: 4px solid #3498db;"><i class="ph ph-chat-centered-text" style="color:#3498db;"></i><div><strong>Admin:</strong><br>${m.texto}</div></div>`;
        });
    } catch(e) { console.error("Erro sino", e); }
}
function abrirNotificacoes() {
    const d = document.getElementById('notif-dropdown');
    if(d) { d.style.display = d.style.display === 'block' ? 'none' : 'block'; if(d.style.display==='block') marcarLidas(); }
}
async function marcarLidas() {
    if(!AFILIADO_TOKEN) return;
    fetch(`${API_URL}/afiliado/notificacoes/ler`, { method: 'POST', headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
    const b = document.getElementById('notif-badge'); if(b) b.style.display = 'none';
}
window.addEventListener('click', (e) => {
    const c = document.getElementById('box-sino');
    const d = document.getElementById('notif-dropdown');
    if (c && d && !c.contains(e.target)) d.style.display = 'none';
});

// CLIENTES (Funções do Modal e Cadastro)
function abrirModalCliente() {
    const inputId = document.getElementById('cli-id');
    if(inputId) inputId.value = ''; 
    if(document.getElementById('cli-nome')) document.getElementById('cli-nome').value = '';
    if(document.getElementById('cli-doc')) document.getElementById('cli-doc').value = '';
    if(document.getElementById('cli-tel')) document.getElementById('cli-tel').value = '';
    if(document.getElementById('cli-email')) document.getElementById('cli-email').value = '';
    if(document.getElementById('cli-endereco')) document.getElementById('cli-endereco').value = '';
    const titulo = document.querySelector('#modal-novo-cliente h3');
    if(titulo) titulo.innerText = "Cadastrar Cliente";
    const radios = document.getElementsByName('tipoPessoa');
    if(radios.length > 0) { radios[0].checked = true; alternarTipo('PF'); }
    const modal = document.getElementById('modal-novo-cliente');
    if(modal) modal.style.display = 'flex';
}

function alternarTipo(tipo) {
    const docInput = document.getElementById('cli-doc');
    const nomeInput = document.getElementById('cli-nome');
    if(tipo === 'PJ') { docInput.placeholder = "CNPJ"; nomeInput.placeholder = "Razão Social"; } 
    else { docInput.placeholder = "CPF"; nomeInput.placeholder = "Nome Completo"; }
}

async function salvarNovoCliente() {
    const idCliente = document.getElementById('cli-id') ? document.getElementById('cli-id').value : null;
    const dados = {
        tipo: document.querySelector('input[name="tipoPessoa"]:checked').value,
        nome: document.getElementById('cli-nome').value,
        documento: document.getElementById('cli-doc').value,
        telefone: document.getElementById('cli-tel').value,
        email: document.getElementById('cli-email').value,
        endereco: document.getElementById('cli-endereco').value
    };
    if(!dados.nome || !dados.documento) return alert("Nome e Documento são obrigatórios.");
    try {
        let url = `${API_URL}/afiliado/cadastrar-cliente`;
        let method = 'POST';
        if (idCliente) {
            url = `${API_URL}/afiliado/clientes/${idCliente}`;
            method = 'PUT';
        }
        const res = await fetch(url, {
            method: method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_TOKEN}` }, body: JSON.stringify(dados)
        });
        if(res.ok) {
            alert(idCliente ? "Cliente atualizado!" : "Cliente cadastrado!");
            document.getElementById('modal-novo-cliente').style.display = 'none';
            carregarClientesCadastrados(); 
        } else { alert("Erro ao salvar."); }
    } catch(e) { console.error(e); }
}

async function carregarClientesCadastrados() {
    const tbody = document.getElementById('lista-clientes-cadastrados');
    if(!tbody) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/meus-clientes-cadastrados`, { headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
        const lista = await res.json();
        tbody.innerHTML = '';
        lista.forEach(c => {
            tbody.innerHTML += `<tr><td><strong>${c.nome}</strong></td><td>${c.tipo}</td><td>${c.documento || '-'}</td><td>${c.telefone || '-'}</td>
                <td><button onclick='prepararEdicao(${JSON.stringify(c)})' style="background:#3498db; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;"><i class="ph ph-pencil-simple"></i> Editar</button></td></tr>`;
        });
    } catch(e) { console.error(e); }
}

function prepararEdicao(cliente) {
    const inputId = document.getElementById('cli-id');
    if(inputId) inputId.value = cliente.id; 
    document.getElementById('cli-nome').value = cliente.nome || '';
    document.getElementById('cli-doc').value = cliente.documento || '';
    document.getElementById('cli-tel').value = cliente.telefone || '';
    document.getElementById('cli-email').value = cliente.email || '';
    document.getElementById('cli-endereco').value = cliente.endereco || '';
    const radios = document.getElementsByName('tipoPessoa');
    if(cliente.tipo === 'PJ') { radios[1].checked = true; alternarTipo('PJ'); } 
    else { radios[0].checked = true; alternarTipo('PF'); }
    const titulo = document.querySelector('#modal-novo-cliente h3');
    if(titulo) titulo.innerText = "Editar Cliente";
    document.getElementById('modal-novo-cliente').style.display = 'flex';
}