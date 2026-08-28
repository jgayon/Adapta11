# Adapta 11

## Resumen

**Adapta 11** es un sistema adaptativo para la preparación de las pruebas Saber 11 que busca personalizar la práctica de los estudiantes mediante la selección inteligente de preguntas de un banco estructurado.

El proyecto surge como respuesta a las limitaciones de los simulacros tradicionales, en los que los estudiantes pueden recibir conjuntos de preguntas que no necesariamente corresponden con sus necesidades, fortalezas, debilidades o intereses de aprendizaje.

La solución propuesta utiliza un banco de preguntas para las áreas de **Matemáticas** y **Lectura Crítica**, organizado de acuerdo con las competencias, componentes y niveles de dificultad correspondientes.

A partir de este banco, el sistema incorpora un seleccionador de preguntas que determina qué ejercicios presentar según dos modalidades:

- **Selección dirigida por el estudiante.**
- **Selección adaptativa basada en su desempeño y progreso.**

En la primera modalidad, el estudiante puede indicar el área o competencia que desea trabajar. En la segunda, el sistema analiza el historial de respuestas, los aciertos, errores, dificultades identificadas y evolución del desempeño para seleccionar preguntas que respondan a sus necesidades de práctica.

De esta manera, el sistema busca priorizar contenidos que requieren refuerzo y ajustar progresivamente la dificultad de las preguntas disponibles.

El proyecto contempla el desarrollo de un prototipo funcional que integra:

- Banco de preguntas.
- Seleccionador adaptativo.
- Perfilamiento del estudiante.
- Registro del desempeño.
- Retroalimentación explicable.
- Panel de seguimiento del progreso.

**Adapta 11** está concebido como una herramienta de apoyo para la preparación del Saber 11 y no pretende reemplazar los mecanismos oficiales de evaluación del ICFES.

---

# 1. Introducción

La educación media en Colombia ha incorporado progresivamente herramientas digitales para apoyar los procesos de enseñanza, aprendizaje y preparación para evaluaciones estandarizadas como el Saber 11.

En este contexto, los bancos de preguntas, plataformas de práctica y sistemas de seguimiento académico permiten complementar las estrategias tradicionales de preparación. A su vez, las técnicas de inteligencia artificial y análisis de datos ofrecen oportunidades para personalizar la experiencia de aprendizaje a partir de la información generada durante las sesiones de práctica.

Sin embargo, muchas plataformas de preparación presentan experiencias de práctica generales en las que los estudiantes resuelven conjuntos de preguntas sin que la selección considere suficientemente sus diferencias individuales.

Esta situación puede provocar que un estudiante dedique tiempo a contenidos que ya domina, mientras recibe poca práctica sobre competencias o componentes en los que presenta dificultades.

El problema resulta especialmente relevante en estudiantes de grado once que necesitan aprovechar eficientemente el tiempo disponible para prepararse para el Saber 11.

A partir de esta situación se identifica la necesidad técnica de contar con un mecanismo que permita seleccionar preguntas de manera más pertinente, utilizando tanto la intención del estudiante como la información acumulada sobre su desempeño.

La oportunidad de diseño consiste en combinar un banco de preguntas previamente estructurado con un sistema capaz de analizar el progreso del estudiante y determinar qué preguntas son más adecuadas para cada sesión, sin depender de la generación automática de nuevos contenidos.

Como respuesta se propone **Adapta 11**, un sistema adaptativo para la preparación del Saber 11 que trabaja inicialmente con las áreas de Matemáticas y Lectura Crítica.

El sistema permitirá al estudiante seleccionar directamente el área o competencia que desea practicar o utilizar un modo adaptativo en el que las preguntas serán seleccionadas de acuerdo con su historial y progreso.

De esta forma, se busca ofrecer una experiencia de práctica personalizada, con seguimiento del desempeño y retroalimentación sobre los resultados obtenidos.

## Contexto

### Dominio o sector

**Educación**, específicamente preparación académica para las pruebas Saber 11.

### Tendencias tecnológicas relevantes

- Aprendizaje adaptativo.
- Análisis de datos educativos.
- Personalización de contenidos.
- Inteligencia artificial aplicada a la educación.

### Rol de los sistemas de información, software y datos

El sistema permitirá:

- Registrar el desempeño del estudiante.
- Organizar el banco de preguntas.
- Analizar el historial de respuestas.
- Apoyar la selección de ejercicios según las necesidades de práctica.

## Situación actual

### Limitaciones del mercado actual

Existen plataformas de preparación que utilizan bancos de preguntas y simulacros con una selección que puede ser poco personalizada.

### Carencias funcionales o de diseño

La selección de ejercicios no siempre considera simultáneamente el área que el estudiante desea trabajar y su progreso individual.

### Impacto en los usuarios

Los estudiantes pueden invertir tiempo en contenidos que ya dominan y recibir menor cantidad de práctica en aquellos donde necesitan refuerzo.

## Necesidad identificada

### Necesidad técnica

Disponer de un mecanismo que seleccione preguntas de un banco estructurado de acuerdo con la intención y el desempeño del estudiante.

### Oportunidad de diseño tecnológico

Utilizar el historial de respuestas y el perfil de desempeño para adaptar progresivamente la selección de preguntas.

## Propuesta general

### Nombre del sistema

**Adapta 11**

### Funcionalidades clave

- Banco estructurado de preguntas.
- Selección dirigida por área o competencia.
- Selección adaptativa basada en el progreso.
- Perfilamiento del estudiante.
- Seguimiento.
- Retroalimentación.

### Impacto esperado

Mejorar la pertinencia de las sesiones de práctica y aprovechar de manera más eficiente el tiempo de preparación para el Saber 11.

---

# 2. Planteamiento del problema

## 2.1 Descripción del problema

Los estudiantes de grado once que se preparan para las pruebas Saber 11 pueden enfrentarse a bancos de preguntas y simulacros cuya selección de ejercicios no se ajusta suficientemente a sus necesidades individuales de aprendizaje.

Cuando la práctica se desarrolla sin considerar el desempeño previo, un estudiante puede recibir preguntas relacionadas con contenidos que ya domina, mientras que las competencias o componentes en los que presenta dificultades pueden no recibir el refuerzo necesario.

Esta situación afecta el aprovechamiento del tiempo de estudio y limita la posibilidad de construir una ruta de práctica diferenciada.

El problema no corresponde a la ausencia de preguntas, sino a la dificultad para determinar cuáles preguntas existentes son más pertinentes para cada estudiante en un momento determinado.

La población objetivo está conformada inicialmente por estudiantes de grado once que se encuentran en proceso de preparación para el Saber 11, específicamente en las áreas de Matemáticas y Lectura Crítica.

## 2.2 Justificación

El problema debe ser atendido porque una selección de preguntas más pertinente puede contribuir a que el tiempo de práctica se concentre en los contenidos que cada estudiante necesita reforzar.

Desde el punto de vista académico, el proyecto permite explorar un enfoque de aprendizaje adaptativo aplicado a la preparación del Saber 11.

Desde el punto de vista técnico, **Adapta 11** plantea el uso de información del desempeño para tomar decisiones sobre la selección de preguntas.

La propuesta diferencia entre:

- La práctica que el estudiante solicita directamente.
- La práctica que el sistema recomienda a partir de su progreso.

Esto permite construir una solución de personalización sin requerir la generación automática de preguntas.

Desde el punto de vista práctico, el sistema busca facilitar una experiencia de preparación más ajustada a las necesidades individuales, proporcionando información sobre:

- Fortalezas.
- Dificultades.
- Evolución del desempeño.

## 2.3 Restricciones y supuestos iniciales

- El proyecto se desarrolla dentro del tiempo académico disponible para el curso.
- El prototipo se limita inicialmente a las áreas de Matemáticas y Lectura Crítica.
- Se asume la disponibilidad de un banco de preguntas previamente estructurado y clasificado.
- La calidad de la selección depende de la cantidad, variedad y correcta clasificación de las preguntas disponibles.
- El sistema requiere registrar las respuestas y el desempeño del estudiante para realizar la selección adaptativa.
- El prototipo se desarrollará en un entorno de pruebas y no contempla un despliegue productivo institucional.
- El sistema no generará automáticamente nuevas preguntas mediante modelos de lenguaje o agentes de inteligencia artificial.

---

# 3. Alcance del proyecto

## Incluye

### Funcionalidades principales del sistema

- Banco de preguntas.
- Clasificación por área.
- Clasificación por competencia.
- Clasificación por componente.
- Clasificación por dificultad.
- Selección dirigida.
- Selección adaptativa.
- Perfilamiento.
- Seguimiento.
- Retroalimentación.

### Tipo de usuarios involucrados

Estudiantes de grado once en proceso de preparación para el Saber 11.

### Nivel de madurez de la solución

**Prototipo funcional.**

### Entornos cubiertos

Aplicación y componentes de software necesarios para:

- Administrar el banco de preguntas.
- Registrar el desempeño.
- Realizar la selección de preguntas.

## No incluye

- Generación automática de nuevas preguntas.
- Generación de contenido mediante modelos de lenguaje o agentes de inteligencia artificial.
- Validación de preguntas generadas por inteligencia artificial.
- Cobertura de las demás áreas del Saber 11 durante esta fase.
- Implementaciones a escala productiva.
- Integraciones externas no críticas.
- Soporte operativo post-proyecto.

---

# 4. Objetivos

## 4.1 Objetivo general

**Diseñar e implementar un prototipo de sistema adaptativo para la preparación del Saber 11 que seleccione dinámicamente preguntas de un banco estructurado para las áreas de Matemáticas y Lectura Crítica, de acuerdo con el área o competencia que el estudiante desee trabajar y con su desempeño y progreso registrado.**

## 4.2 Objetivos específicos

- Construir y organizar un banco de preguntas para las áreas de Matemáticas y Lectura Crítica, clasificándolas de acuerdo con los componentes, competencias y niveles de dificultad correspondientes.

- Diseñar e implementar un mecanismo de selección dirigida que permita al estudiante elegir el área o competencia que desea practicar.

- Diseñar e implementar un mecanismo de selección adaptativa que utilice el historial de respuestas y el progreso del estudiante para identificar fortalezas y debilidades y seleccionar preguntas acordes con sus necesidades de aprendizaje.

- Implementar un sistema de seguimiento que registre el desempeño del estudiante y permita observar su evolución a lo largo de las sesiones de práctica.

- Diseñar un sistema de retroalimentación que permita al estudiante comprender sus resultados, identificar los contenidos que requieren mayor atención y orientar sus futuras sesiones de práctica.

---

# 5. Solución propuesta

**Adapta 11** se propone como un sistema adaptativo compuesto por:

- Un banco estructurado de preguntas.
- Un seleccionador de preguntas.
- Un componente de perfilamiento del estudiante.
- Herramientas de seguimiento.
- Herramientas de retroalimentación.

## Banco de preguntas

El banco de preguntas contendrá ejercicios de Matemáticas y Lectura Crítica clasificados por:

- Área.
- Competencia.
- Componente.
- Nivel de dificultad.

Esta estructura permitirá realizar búsquedas y filtros de acuerdo con las necesidades de cada sesión.

## Seleccionador de preguntas

El seleccionador de preguntas funcionará mediante dos modalidades.

### Selección dirigida

El estudiante podrá seleccionar directamente el área o competencia que desea trabajar.

El sistema consultará el banco y presentará preguntas correspondientes a esa selección.

### Selección adaptativa

El sistema utilizará el historial de respuestas y el progreso registrado para identificar contenidos que requieren mayor práctica y seleccionar preguntas apropiadas para el estudiante.

## Perfilamiento del estudiante

El perfilamiento del estudiante registrará información relacionada con:

- Respuestas.
- Aciertos.
- Errores.
- Niveles de dificultad trabajados.
- Evolución del desempeño.

Esta información será utilizada para orientar la selección adaptativa de futuras preguntas.

## Seguimiento y retroalimentación

El seguimiento y la retroalimentación permitirán:

- Mostrar los resultados de las sesiones.
- Identificar fortalezas.
- Identificar dificultades.
- Proporcionar información útil para orientar las siguientes sesiones de práctica.

## Usuarios principales

Los usuarios principales serán estudiantes de grado once que se preparan para el Saber 11.

## Flujo general del sistema

1. El estudiante inicia una sesión.
2. Selecciona un área o competencia o activa el modo adaptativo.
3. El sistema consulta el banco estructurado.
4. El sistema selecciona las preguntas correspondientes.
5. El estudiante responde las preguntas.
6. El sistema registra los resultados.
7. El perfil de desempeño del estudiante es actualizado.

La propuesta constituye una respuesta al problema porque no se limita a ofrecer un banco estático de preguntas, sino que incorpora un mecanismo para seleccionar las preguntas más pertinentes según:

- La intención del estudiante.
- El progreso registrado.

El sistema no contempla la generación automática de nuevas preguntas.

---

# 6. Estado del arte y soluciones relacionadas

El análisis del estado del arte busca identificar antecedentes o soluciones existentes relevantes para contextualizar la propuesta y mostrar oportunidades de diferenciación, mejora o aporte.

Se revisarán los siguientes tipos de soluciones:

- Productos comerciales orientados a la preparación del Saber 11.
- Soluciones *open source* relacionadas con bancos de preguntas y aprendizaje adaptativo.
- Plataformas educativas que realizan seguimiento del desempeño.
- Arquitecturas o enfoques técnicos relevantes para la selección adaptativa de contenido.
- Sistemas que utilizan reglas, perfiles de usuario o modelos de recomendación para seleccionar ejercicios.

## Criterios de comparación

Las soluciones identificadas podrán compararse de acuerdo con los siguientes criterios:

- Funcionalidad.
- Capacidad de personalización.
- Criterios utilizados para seleccionar preguntas.
- Escalabilidad.
- Costos.
- Usabilidad.
- Seguimiento del progreso.
- Retroalimentación.
- Limitaciones técnicas.

## Resultados esperados

Se espera obtener:

- Identificación de vacíos, oportunidades o problemas no resueltos relacionados con la personalización de la práctica para Saber 11.
- Justificación técnica de por qué se requiere una solución que seleccione preguntas de acuerdo con la intención y el progreso individual del estudiante.
- Identificación de las características que diferencian a Adapta 11 de los sistemas que únicamente presentan bancos de preguntas o simulacros generales.

---

# 7. Metodología de desarrollo y plan de trabajo

## 7.1 Enfoque metodológico

Para **Adapta 11** se propone un enfoque de **prototipado iterativo**, debido a que el sistema requiere construir progresivamente:

- El banco de preguntas.
- El mecanismo de selección.
- El perfilamiento del estudiante.

Cada iteración permitirá comprobar el funcionamiento de los componentes y realizar ajustes antes de integrar la siguiente etapa.

El proceso se desarrollará mediante ciclos de:

1. Diseño.
2. Implementación.
3. Pruebas.
4. Ajuste.

La validación permitirá comprobar tanto la correspondencia entre la selección realizada y el área solicitada por el estudiante como la coherencia entre el desempeño registrado y las preguntas seleccionadas en el modo adaptativo.

---

## 7.2 Iteraciones o fases de desarrollo

### Iteración 1 — Banco de preguntas y clasificación

**Propósito:** construir y estructurar el banco inicial de preguntas.

**Actividades principales:**

- Recopilación del banco de preguntas de Matemáticas y Lectura Crítica.
- Organización y estructuración de las preguntas.
- Definición de los campos necesarios para clasificar cada pregunta.

Las preguntas serán clasificadas según:

- Área.
- Competencia.
- Componente.
- Nivel de dificultad.

---

### Iteración 2 — Selección dirigida y selección adaptativa

**Propósito:** desarrollar el mecanismo encargado de seleccionar las preguntas.

**Actividades principales:**

- Diseño del seleccionador de preguntas.
- Implementación de la selección dirigida.
- Implementación de la selección adaptativa.

Inicialmente se desarrollará la selección dirigida, en la que el estudiante podrá indicar qué área o competencia desea practicar.

Posteriormente se implementará la selección adaptativa basada en:

- Historial de respuestas.
- Progreso del estudiante.

---

### Iteración 3 — Perfilamiento y seguimiento

**Propósito:** desarrollar los mecanismos de registro y seguimiento del desempeño.

**Actividades principales:**

- Desarrollo del perfil de desempeño.
- Registro de resultados.
- Desarrollo de la retroalimentación.
- Desarrollo del panel de seguimiento.
- Integración de los componentes anteriores.

El resultado esperado será un prototipo funcional **end-to-end**.

---

### Cierre — Pruebas y ajustes finales

**Actividades principales:**

- Realización de pruebas funcionales.
- Revisión de resultados.
- Ajustes del mecanismo de selección.
- Documentación.
- Preparación del prototipo final.

---

## 7.3 Estrategia de validación

La validación de **Adapta 11** se realizará mediante pruebas funcionales y, cuando sea posible, con estudiantes voluntarios.

### Validación de la selección dirigida

Se verificará que las preguntas presentadas correspondan al área o competencia solicitada por el estudiante.

### Validación de la selección adaptativa

Se comprobará la coherencia entre:

- El historial de respuestas.
- Los resultados obtenidos.
- Las dificultades identificadas.
- Las preguntas seleccionadas por el sistema.

También se revisará que la dificultad seleccionada sea coherente con el perfil de desempeño registrado.

### Validación del perfilamiento y seguimiento

Se verificará que:

- Las respuestas se registren correctamente.
- Los aciertos se registren correctamente.
- Los errores se registren correctamente.
- Los demás indicadores se almacenen correctamente.
- Los resultados mostrados correspondan al desempeño real del estudiante.

### Retroalimentación de usuarios

Adicionalmente, se podrá utilizar retroalimentación cualitativa de los usuarios para evaluar:

- La pertinencia de las preguntas seleccionadas.
- La facilidad de uso del sistema.
- La utilidad de la información presentada en el panel de seguimiento.

---

## 7.4 Plan de trabajo, cronograma e hitos

| Fase | Actividades principales | Entregable | Duración |
|---|---|---|---|
| **Iteración 1** | Recopilación, curación, clasificación y estructuración del banco de preguntas | Banco de preguntas estructurado | 3 semanas |
| **Iteración 2** | Diseño e implementación de la selección dirigida y selección adaptativa | Seleccionador integrado al banco de preguntas | 4 semanas |
| **Iteración 3** | Perfilamiento, seguimiento, retroalimentación y panel de progreso | Prototipo funcional end-to-end | 4 semanas |
| **Cierre** | Pruebas, ajustes finales, documentación y validación | Informe final y prototipo validado | 2 semanas |

---

# 8. Referencias

Esta sección incluirá las fuentes consultadas y citadas durante el desarrollo del proyecto, utilizando el formato de citación definido para el curso o proyecto.

> **Nota:** En el documento original se establece la sección de referencias, pero no se incluyen fuentes bibliográficas específicas.
