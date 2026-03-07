import pandas as pd
from typing import TypedDict, Dict, Any
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

# ==========================================
# 1. ESTADO ACTUALIZADO (DataState)
# ==========================================
class DataState(TypedDict):
    # --- Fase 1 (Existente) ---
    file_path: str
    clean_file_path: str
    context: str                 
    cleaning_code: str           
    format_valid: bool           
    data_integrity_valid: bool   
    iteration: int               
    errors: str
    
    # --- NUEVO: Summaries de Agentes 1 al 4 ---
    summaries: Dict[str, str]
    
    # --- NUEVO: Fase 2 (Análisis) ---
    final_analysis: str
    human_analysis_feedback: str
    analysis_approved: bool
    
    # --- NUEVO: Fase 3 (Visualización) ---
    viz_proposals: str
    chosen_viz: str
    generated_report_data: Any
    final_audit_passed: bool


llm = ChatOpenAI(model="gpt-4o", temperature=0)

# ==========================================
# 2. NODOS DE LA FASE 2 Y 3
# ==========================================

def agent_5_analyst(state: DataState):
    """Agente 5: Concluye un análisis final usando los resúmenes y datos."""
    print("\n--- [AGENTE 5] Generando Análisis Final ---")
    
    contexto_acumulado = "\n".join([f"{k}: {v}" for k, v in state.get("summaries", {}).items()])
    feedback = state.get("human_analysis_feedback", "Ninguno todavía.")
    
    prompt = f"""
    Eres un Data Analyst Senior. Aquí tienes los resúmenes de los agentes técnicos:
    {contexto_acumulado}
    
    Feedback previo del usuario (si lo hay, atiende sus correcciones): {feedback}
    
    Genera un Análisis Final conceptual del archivo. ¿Qué tendencias, conclusiones o advertencias puedes extraer?
    """
    
    response = llm.invoke([HumanMessage(content=prompt)])
    return {"final_analysis": response.content}


def human_approval_1(state: DataState):
    """Nodo Humano 1: Aprueba o rechaza el análisis del Agente 5."""
    print("\n" + "="*50)
    print("ANÁLISIS DEL AGENTE 5:")
    print(state["final_analysis"])
    print("="*50)
    
    # Simulamos el input humano en terminal
    decision = input("\n[HUMANO] ¿Apruebas este análisis? (s/n): ").strip().lower()
    
    if decision == 's':
        return {"analysis_approved": True, "human_analysis_feedback": "Aprobado"}
    else:
        feedback = input("[HUMANO] Por favor, indica qué es incorrecto o qué debe revisar: ")
        return {"analysis_approved": False, "human_analysis_feedback": feedback}


def agent_4_assist_analysis(state: DataState):
    """Agente 4 (Rol B): Ayuda al Agente 5 verificando datos concretos ante el rechazo humano."""
    print("\n--- [AGENTE 4] Verificando datos tras queja del usuario ---")
    # Lógica: Lee el archivo limpio, lee la queja del usuario, y le genera un reporte de hechos al Agente 5
    hechos_verificados = f"El usuario se quejó: '{state['human_analysis_feedback']}'. Verifiqué los datos crudos y esto es lo real: [Hechos verificados por código Python]."
    
    # Actualizamos el feedback para que el Agente 5 lo lea como contexto duro
    return {"human_analysis_feedback": f"Comentario del usuario: {state['human_analysis_feedback']} | Verificación de Auditoría (Agente 4): {hechos_verificados}"}


def agent_6_viz_expert(state: DataState):
    """Agente 6: Determina dimensiones, métricas y propone 3 combinaciones de visualización."""
    print("\n--- [AGENTE 6] Proponiendo Visualizaciones Estratégicas ---")
    
    prompt = f"""
    Eres un Experto en Data Visualization y BI. El análisis aprobado es: {state['final_analysis']}
    
    Analiza las variables y determina:
    1. Métricas (variables numéricas)
    2. Dimensiones (categorías, productos, etc.)
    3. Temporalidad e IDs.
    
    Propón EXACTAMENTE 3 combinaciones diferentes y avanzadas para visualizar en un Dashboard.
    Incluye qué gráficos usar (Scatter, Bar, Line, etc.) y qué filtros interactivos añadir (ej. Filtro por país, fecha).
    """
    
    response = llm.invoke([HumanMessage(content=prompt)])
    return {"viz_proposals": response.content}


def human_approval_2(state: DataState):
    """Nodo Humano 2: Selecciona cómo quiere visualizar los datos."""
    print("\n" + "="*50)
    print("PROPUESTAS DE VISUALIZACIÓN (AGENTE 6):")
    print(state["viz_proposals"])
    print("="*50)
    
    decision = input("\n[HUMANO] ¿Qué combinación eliges o qué ajustes quieres? (Ej: 'Quiero la opción 2 pero con filtro por año'): ")
    return {"chosen_viz": decision}


def report_generator(state: DataState):
    """Genera los reportes (Simulación de creación de gráficos o tablas pivot)."""
    print("\n--- [SISTEMA] Generando Reportes y Dashboards ---")
    # En la vida real, aquí un Agente genera código Python (matplotlib/seaborn/plotly)
    # y guarda las imágenes o un HTML.
    
    report_data_mock = "DATOS_AGRUPADOS_DEL_REPORTE"
    return {"generated_report_data": report_data_mock}


def agent_4_final_audit(state: DataState):
    """Agente 4 (Rol C): Verifica que el reporte final coincida con el source (XLSX)."""
    print("\n--- [AGENTE 4] Auditoría Final: Reporte vs Archivo XLSX original ---")
    
    # Lógica programática:
    # df_source = pd.read_excel(state["file_path"])
    # suma_source = df_source['Monto'].sum()
    # suma_reporte = extraida_de_report_data
    # match = suma_source == suma_reporte
    
    match = True # Simulación
    if match:
        print("✅ [AGENTE 4] Auditoría Final PASADA. No hay discrepancias numéricas.")
    else:
        print("❌ [AGENTE 4] ERROR: Los números del reporte no coinciden con el source.")
        
    return {"final_audit_passed": match}

# ==========================================
# 3. ENRUTADORES (Condiciones)
# ==========================================

def route_human_1(state: DataState):
    if state["analysis_approved"]:
        return "Agent_6_Viz"
    else:
        return "Agent_4_Assist"

# ==========================================
# 4. CONSTRUCCIÓN DEL GRAFO (Ampliación)
# ==========================================

workflow = StateGraph(DataState)

# (Aquí irían los nodos de la Fase 1: Ag1, Ag2, Ag3, Ag4A)
# Asumiremos que el "Join_Evaluation" de la Fase 1 pasa el flujo al Agente 5.

workflow.add_node("Agent_5_Analyst", agent_5_analyst)
workflow.add_node("Human_Approval_1", human_approval_1)
workflow.add_node("Agent_4_Assist", agent_4_assist_analysis)

workflow.add_node("Agent_6_Viz", agent_6_viz_expert)
workflow.add_node("Human_Approval_2", human_approval_2)

workflow.add_node("Report_Generator", report_generator)
workflow.add_node("Agent_4_Final_Audit", agent_4_final_audit)

# --- Conexiones Fase 2 ---
# Desde el final de la Fase 1 entramos al Agente 5
workflow.add_edge(START, "Agent_5_Analyst") # START simplificado para este script
workflow.add_edge("Agent_5_Analyst", "Human_Approval_1")

# Condicional Humano 1
workflow.add_conditional_edges(
    "Human_Approval_1",
    route_human_1,
    {
        "Agent_6_Viz": "Agent_6_Viz",        # Aprobado -> Pasa al Agente 6
        "Agent_4_Assist": "Agent_4_Assist"   # Rechazado -> Pasa a Agente 4
    }
)
# Si fue rechazado, el Agente 4 asiste y se lo devuelve al Agente 5 para rehacer
workflow.add_edge("Agent_4_Assist", "Agent_5_Analyst")

# --- Conexiones Fase 3 ---
workflow.add_edge("Agent_6_Viz", "Human_Approval_2")
workflow.add_edge("Human_Approval_2", "Report_Generator")
workflow.add_edge("Report_Generator", "Agent_4_Final_Audit")
workflow.add_edge("Agent_4_Final_Audit", END)

# Compilar el grafo
app = workflow.compile()

# ==========================================
# 5. EJECUCIÓN DEL FLUJO
# ==========================================
if __name__ == "__main__":
    # Estado inicial simulado proviniendo de la Fase 1 ya aprobada
    initial_state = {
        "file_path": "datos.xlsx",
        "clean_file_path": "datos_clean.xlsx",
        "summaries": {
            "Agente 1": "Es un reporte de ventas de 2023.",
            "Agente 2": "Limpié los nulos y formaté las fechas a YYYY-MM-DD.",
            "Agente 3": "Validé que la columna 'Monto' sea Float64.",
            "Agente 4": "Confirmado, no se perdió ni una sola fila."
        },
        "errors": ""
    }
    
    # Ejecutamos el flujo
    for event in app.stream(initial_state, {"recursion_limit": 20}):
        # Cada nodo que se ejecuta lanzará sus prints de consola
        pass