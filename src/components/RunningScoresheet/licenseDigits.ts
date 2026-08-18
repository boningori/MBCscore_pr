// 公式様式のライセンスNo.欄は3マス。JBA登録番号の下3桁を1マスに1文字ずつ入れる。
//
// 3文字に満たないときは右詰めにする。「下3桁」なので一の位が右端のマスに来る
// のが自然で、桁を揃えて読めるようにするためでもある。
//
// 以前は `raw.padStart(3, '')` と書いていたが、パッド文字が空文字だと padStart は
// 何もしない（'12'.padStart(3, '') === '12'）。意図した右詰めは一度も効いておらず、
// 2桁以下のライセンスNo.は左詰めで印字され、一の位が真ん中のマスに入っていた。
//
// 同じ処理を選手行・コーチ行・A.コーチ行の3か所に複製していたので、ここへ集約する。

/** 3マス分の文字。埋まらないマスは空文字 */
export type LicenseDigits = [string, string, string];

/** ライセンスNo.の下3桁を、様式の3マスへ右詰めで割り当てる */
export function licenseDigits(licenseNo: string | undefined): LicenseDigits {
    const last3 = (licenseNo || '').slice(-3);
    const digits: LicenseDigits = ['', '', ''];
    const offset = 3 - last3.length;
    for (let i = 0; i < last3.length; i++) {
        digits[offset + i] = last3[i];
    }
    return digits;
}
