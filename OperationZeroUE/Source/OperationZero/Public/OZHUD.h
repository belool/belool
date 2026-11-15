#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "OZHUD.generated.h"

// HUD desenhado no Canvas: mira dinâmica, marcador de acerto, direção do
// dano, vida/armadura, munição, placar, tempo, feed de abates, rádio,
// minimapa, luneta, respiração e telas de morte/fim de partida.
UCLASS()
class OPERATIONZERO_API AOZHUD : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;
protected:
	void Text(const FString& S, float X, float Y, const FLinearColor& C, float Scale = 1.f, bool bCenter = false, bool bRight = false);
	void DrawMinimap(class AOZCharacter* P, float X, float Y, float Size);
};
