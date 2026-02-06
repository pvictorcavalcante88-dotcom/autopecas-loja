const API_URL = window.location.origin; // Deixe vazio se estiver no mesmo domínio

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
window.DADOS_AFILIADO = {}; // Armazena o perfil para checagem rápida

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

// No arquivo afiliado.js

async function carregarDashboardCompleto() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados");

        const dados = await res.json();
        window.DADOS_AFILIADO = dados;
        window.TODAS_VENDAS = dados.vendas || [];
        
        // --- PREENCHIMENTO BÁSICO (IGUAL AO SEU) ---
        const elNome = document.getElementById('nome-afiliado');
        if(elNome) elNome.innerText = `Olá, ${dados.nome}!`;

        const elQtd = document.getElementById('qtd-vendas');
        if(elQtd && dados.vendas) {
            const aprovadas = dados.vendas.filter(v => ['APROVADO','ENTREGUE','DEVOLUCAO_PARCIAL'].includes(v.status)).length;
            elQtd.innerText = aprovadas;
        }

        // --- 🔴 LÓGICA DO SALDO DEVEDOR (NOVO) ---
        const boxDebito = document.getElementById('box-debito-alert');
        const valorDebitoDisplay = document.getElementById('valor-debito-display');
        const saldoDisplay = document.getElementById('saldo-total');

        // O backend deve retornar: dados.saldo (Saldo Positivo) e dados.saldoDevedor (Dívida)
        const saldoPositivo = parseFloat(dados.saldo || 0);
        const saldoDevedor = parseFloat(dados.saldoDevedor || 0); // <--- CAMPO NOVO

        if (saldoDevedor > 0) {
            // Mostra o alerta vermelho
            if(boxDebito) boxDebito.style.display = 'block';
            if(valorDebitoDisplay) valorDebitoDisplay.innerText = `-${saldoDevedor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`;
            
            // Opcional: Se você quiser mostrar o saldo liquido real (Saldo - Dívida) no card verde
            // Mas geralmente mostramos o saldo zerado se a dívida for maior que o saldo
            let saldoReal = saldoPositivo - saldoDevedor;
            if (saldoReal < 0) saldoReal = 0; 
            
            if(saldoDisplay) saldoDisplay.innerText = saldoReal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            
        } else {
            // Esconde alerta se não dever nada
            if(boxDebito) boxDebito.style.display = 'none';
            if(saldoDisplay) saldoDisplay.innerText = saldoPositivo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        }
        // ------------------------------------------

        // Continuação do preenchimento...
        if(document.getElementById('input-pix')) document.getElementById('input-pix').value = dados.chavePix || '';
        // ... (resto dos seus inputs)

        calcularVendasPorPeriodo(); 
        preencherTabelaVendas('lista-ultimas-vendas', dados.vendas.slice(0, 5)); 
        preencherTabelaVendas('lista-todas-vendas', dados.vendas); 
        preencherCamposPerfil(dados);

    } catch (error) {
        console.error("Erro Fatal:", error);
    }
}

// ============================================================
// 🟢 CÁLCULO DO WIDGET (SOMA VENDA + SOMA LUCRO)
// ============================================================
// ============================================================
// 🟢 CÁLCULO DO WIDGET (CORRIGIDO PARA FUSO HORÁRIO)
// ============================================================
function calcularVendasPorPeriodo() {
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    
    // IDs ATUALIZADOS PARA BATER COM O HTML
    const elTotalVendas = document.getElementById('total-periodo-venda'); 
    const elTotalLucro = document.getElementById('total-periodo-lucro'); 
    
    if(!elInicio || !elFim) return;

    const inicioStr = elInicio.value; 
    const fimStr = elFim.value;

    if (!inicioStr || !fimStr) return;

    let totalVendaPeriodo = 0;
    let totalLucroPeriodo = 0;

    if (window.TODAS_VENDAS) {
        window.TODAS_VENDAS.forEach(v => {
            // Filtra apenas vendas que geram dinheiro real
            if (['APROVADO', 'ENTREGUE', 'DEVOLUCAO_PARCIAL', 'PAGO'].includes(v.status)) {
                
                const dataObj = new Date(v.createdAt);
                const ano = dataObj.getFullYear();
                const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
                const dia = String(dataObj.getDate()).padStart(2, '0');
                const dataVendaLocal = `${ano}-${mes}-${dia}`;

                if (dataVendaLocal >= inicioStr && dataVendaLocal <= fimStr) {
                    // SOMA O VALOR BRUTO DA VENDA
                    totalVendaPeriodo += parseFloat(v.valorTotal || 0);
                    // SOMA A COMISSÃO LÍQUIDA (O que sobra para o afiliado)
                    totalLucroPeriodo += parseFloat(v.comissaoGerada || 0);
                }
            }
        });
    }

    // Exibe o Faturamento Bruto
    if(elTotalVendas) {
        elTotalVendas.innerText = totalVendaPeriodo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    }
    
    // Exibe o Lucro Líquido do Parceiro
    if(elTotalLucro) {
        elTotalLucro.innerText = totalLucroPeriodo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    }
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
// RENDERIZAÇÃO DE TABELAS (COM LUCRO LÍQUIDO)
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
        
        const valor = parseFloat(v.valorTotal || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        // 🟢 AQUI: Pega a comissão salva no banco
        const comissaoValor = parseFloat(v.comissaoGerada || 0);
        const comissaoDisplay = comissaoValor.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        let statusStyle = "background:#eee; color:#333;";
        if(v.status === 'APROVADO') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'ENTREGUE') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'PENDENTE' || v.status === 'AGUARDANDO_PAGAMENTO') statusStyle = "background:#fff3cd; color:#856404;";
        if(v.status === 'CANCELADO') statusStyle = "background:#f8d7da; color:#721c24;";
        if(v.status === 'PAGO') statusStyle = "background:#cce5ff; color:#004085;";

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data}</td>
            <td>${v.clienteNome || 'Cliente'}</td>
            <td>${valor}</td>
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span style="color:#27ae60; font-weight:bold;">+ ${comissaoDisplay}</span>
                    <span style="font-size:0.7rem; color:#95a5a6;">Líquido</span>
                </div>
            </td>
            <td><span style="padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold; ${statusStyle}">${v.status || 'PENDENTE'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function preencherCamposPerfil(dados) {
    if(!dados) return;
    
    // Header do Perfil
    if(document.getElementById('perfil-nome-display')) document.getElementById('perfil-nome-display').innerText = dados.nome;
    if(document.getElementById('img-perfil-preview') && dados.foto) document.getElementById('img-perfil-preview').src = dados.foto;

    // Campos do Formulário
    if(document.getElementById('perfil-nome')) document.getElementById('perfil-nome').value = dados.nome || '';
    if(document.getElementById('perfil-email')) document.getElementById('perfil-email').value = dados.email || '';
    if(document.getElementById('perfil-cpf')) document.getElementById('perfil-cpf').value = dados.cpf || '';
    if(document.getElementById('perfil-telefone')) document.getElementById('perfil-telefone').value = dados.telefone || '';
    if(document.getElementById('perfil-endereco')) document.getElementById('perfil-endereco').value = dados.endereco || '';
    
    // Bancários
    if(document.getElementById('perfil-pix')) document.getElementById('perfil-pix').value = dados.chavePix || '';
    if(document.getElementById('perfil-banco')) document.getElementById('perfil-banco').value = dados.banco || '';
    if(document.getElementById('perfil-agencia')) document.getElementById('perfil-agencia').value = dados.agencia || '';
    if(document.getElementById('perfil-conta')) document.getElementById('perfil-conta').value = dados.conta || '';
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
    // ---------------------------------------------------------
    // 1. VERIFICAÇÃO DE SEGURANÇA (PERFIL)
    // ---------------------------------------------------------
    
    // Verifica se os dados já carregaram
    if (!window.DADOS_AFILIADO) {
        alert("Aguarde, carregando informações do usuário...");
        return;
    }

    const d = window.DADOS_AFILIADO; 
    
    // Verifica se os campos obrigatórios estão vazios
    const perfilIncompleto = !d.cpf || !d.chavePix || !d.endereco || !d.telefone;

    if (perfilIncompleto) {
        const confirmacao = confirm("⚠️ PERFIL INCOMPLETO!\n\nPara sua segurança, precisamos do seu CPF, Endereço e Chave Pix configurados antes de liberar o saque.\n\nDeseja completar agora?");
        
        if (confirmacao) {
            mudarAba('perfil'); // Leva ele para a aba de perfil
            
            // Rola a tela até o formulário e destaca o CPF
            setTimeout(() => {
                const form = document.getElementById('form-perfil');
                const cpfInput = document.getElementById('perfil-cpf');
                
                if(form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                if(cpfInput) {
                    cpfInput.focus();
                    cpfInput.style.border = "2px solid red"; 
                    // Remove o vermelho quando o usuário clicar
                    cpfInput.onfocus = () => cpfInput.style.border = "1px solid #ddd";
                }
            }, 500);
        }
        return; // ⛔ PARA TUDO AQUI. O saque não acontece.
    }

    // ---------------------------------------------------------
    // 2. SE O PERFIL ESTIVER COMPLETO, FAZ O SAQUE (Seu código original)
    // ---------------------------------------------------------
    if(!confirm("Deseja solicitar o saque de todo o saldo disponível?")) return;
    
    const btn = document.getElementById('btn-saque'); 
    const textoOriginal = btn ? btn.innerText : "Solicitar Saque";

    if(btn) {
        btn.innerText = "Processando...";
        btn.disabled = true; // Evita clique duplo
    }

    try {
        const res = await fetch(`${API_URL}/afiliado/saque`, {
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert("✅ Solicitação Enviada! Valor: R$ " + parseFloat(data.valor).toFixed(2));
            carregarDashboardCompleto(); // Atualiza o saldo na tela
        } else {
            alert("Atenção: " + (data.erro || "Falha ao solicitar."));
        }
    } catch (e) { 
        alert("Erro de conexão."); 
        console.error(e);
    } finally { 
        if(btn) {
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    }
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

async function salvarPerfilCompleto() {
    const btn = document.querySelector('#form-perfil button');
    const textoOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    // Pega os valores
    const dadosForm = {
        nome: document.getElementById('perfil-nome').value,
        cpf: document.getElementById('perfil-cpf').value,
        telefone: document.getElementById('perfil-telefone').value,
        endereco: document.getElementById('perfil-endereco').value,
        chavePix: document.getElementById('perfil-pix').value,
        banco: document.getElementById('perfil-banco').value,
        agencia: document.getElementById('perfil-agencia').value,
        conta: document.getElementById('perfil-conta').value,
        senha: document.getElementById('perfil-senha').value
    };

    try {
        const res = await fetch(`${API_URL}/afiliado/perfil-completo`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${AFILIADO_TOKEN}` 
            },
            body: JSON.stringify(dadosForm)
        });

        if(res.ok) {
            alert("✅ Salvo com sucesso!");
            
            // 🟢 TRUQUE: Atualiza a variável global IMEDIATAMENTE com o que você digitou
            // Isso evita que o dado suma antes do banco atualizar
            if (!window.DADOS_AFILIADO) window.DADOS_AFILIADO = {};
            
            // Mescla os dados novos com os antigos na memória do navegador
            Object.assign(window.DADOS_AFILIADO, dadosForm);
            
            // Limpa o campo de senha por segurança
            document.getElementById('perfil-senha').value = '';
            document.getElementById('perfil-confirma-senha').value = '';

        } else {
            const erro = await res.json();
            alert("Erro ao salvar: " + (erro.erro || "Tente novamente."));
        }
    } catch(e) {
        console.error(e);
        alert("Erro de conexão.");
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

// Função auxiliar para preview da foto (apenas visual por enquanto)
function previewImagem(event) {
    const input = event.target;
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('img-perfil-preview').src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
        // OBS: Para salvar a foto no banco, você precisará de uma lógica de upload (FormData) no backend.
        // Por enquanto, isso é apenas visual no navegador.
    }
}

// =========================================
// LÓGICA DO TOUR / ONBOARDING
// =========================================

let tourStepAtual = 0;
const totalSteps = 5;

document.addEventListener("DOMContentLoaded", () => {
    // Verifica se é a primeira vez do usuário
    const jaViuTour = localStorage.getItem('vunn_tour_visto');
    
    if (!jaViuTour) {
        // Se não viu, abre o tour (pequeno delay pra carregar a tela antes)
        setTimeout(() => {
            document.getElementById('tour-overlay').style.display = 'flex';
        }, 1000);
    }
});

function proximoPasso() {
    // Esconde o atual
    document.querySelector(`.tour-step[data-index="${tourStepAtual}"]`).classList.remove('active');
    document.querySelectorAll('.dot')[tourStepAtual].classList.remove('active');

    // Avança
    tourStepAtual++;

    // Se chegou no fim da navegação (Passo 5 é o último, index 4)
    if (tourStepAtual >= totalSteps) {
        fecharTour();
        return;
    }

    // Mostra o próximo
    document.querySelector(`.tour-step[data-index="${tourStepAtual}"]`).classList.add('active');
    document.querySelectorAll('.dot')[tourStepAtual].classList.add('active');

    // Se for o último passo, esconde a navegação padrão (botões) pq o botão verde assume
    if (tourStepAtual === 4) {
        document.getElementById('tour-nav').style.display = 'none';
    }
}

function fecharTour() {
    document.getElementById('tour-overlay').style.display = 'none';
    // Marca que já viu para não abrir sozinho de novo
    localStorage.setItem('vunn_tour_visto', 'true');
}

// Função para o botão do Header (Reabrir)
function abrirTourManual() {
    tourStepAtual = 0;
    
    // Reseta visualização
    document.querySelectorAll('.tour-step').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.dot').forEach(el => el.classList.remove('active'));
    
    // Ativa o primeiro
    document.querySelector(`.tour-step[data-index="0"]`).classList.add('active');
    document.querySelectorAll('.dot')[0].classList.add('active');
    
    // Mostra controles
    document.getElementById('tour-nav').style.display = 'flex';
    
    // Abre modal
    document.getElementById('tour-overlay').style.display = 'flex';
}